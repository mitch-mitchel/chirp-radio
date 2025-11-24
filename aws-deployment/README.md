# AWS ECS Deployment Guide

This directory contains scripts and configuration for deploying the CHIRP Radio frontend to AWS ECS (Elastic Container Service).

## Prerequisites

1. **AWS CLI installed and configured**

   ```bash
   aws configure
   ```

2. **Docker installed** (for building images)

3. **AWS Resources** (from your existing CMS deployment):
   - VPC ID
   - Subnet IDs (at least 2 in different AZs for ALB)
   - Security Group ID
   - ECS Cluster name (should be `chirp-cluster`)
   - CMS Service name in ECS

4. **IAM Permissions**:
   - ECR: Push/pull images
   - ECS: Create/update services and task definitions
   - ELB: Create/manage load balancers
   - CloudWatch: Create log groups
   - IAM: PassRole for task execution

## Setup Steps

### 1. Get Your Existing Infrastructure Info

First, gather information from your existing CMS deployment:

```bash
# Get your VPC ID
aws ec2 describe-vpcs --region us-east-2

# Get subnet IDs in your VPC
aws ec2 describe-subnets --region us-east-2 --filters "Name=vpc-id,Values=YOUR_VPC_ID"

# Get security groups
aws ec2 describe-security-groups --region us-east-2 --filters "Name=vpc-id,Values=YOUR_VPC_ID"

# List ECS services in your cluster
aws ecs list-services --cluster chirp-cluster --region us-east-2

# Get CMS service details
aws ecs describe-services --cluster chirp-cluster --services YOUR_CMS_SERVICE_NAME --region us-east-2
```

### 2. Configure the Deployment Script

Edit `deploy.sh` and update these variables:

```bash
# Required - Get these from your CMS deployment
VPC_ID="vpc-xxxxx"                    # Your VPC ID
SUBNET_IDS="subnet-xxxxx,subnet-yyyyy"  # Comma-separated subnet IDs
SECURITY_GROUP_ID="sg-xxxxx"          # Security group ID
CMS_SERVICE_NAME="chirp-cms"          # Your CMS ECS service name

# Optional - For HTTPS
CERTIFICATE_ARN="arn:aws:acm:..."     # ACM certificate ARN
```

### 3. Update Security Group Rules

Your security group needs to allow:

```bash
# Allow inbound HTTP/HTTPS from internet (for ALB)
aws ec2 authorize-security-group-ingress \
    --group-id YOUR_SG_ID \
    --protocol tcp \
    --port 80 \
    --cidr 0.0.0.0/0 \
    --region us-east-2

aws ec2 authorize-security-group-ingress \
    --group-id YOUR_SG_ID \
    --protocol tcp \
    --port 443 \
    --cidr 0.0.0.0/0 \
    --region us-east-2

# Allow frontend to communicate with CMS on port 3000
aws ec2 authorize-security-group-ingress \
    --group-id YOUR_SG_ID \
    --protocol tcp \
    --port 3000 \
    --source-group YOUR_SG_ID \
    --region us-east-2
```

### 4. Set Up Service Discovery (Recommended)

For ECS services to communicate by name, set up AWS Cloud Map:

```bash
# Create a private DNS namespace
aws servicediscovery create-private-dns-namespace \
    --name local \
    --vpc YOUR_VPC_ID \
    --region us-east-2

# Get the namespace ID
NAMESPACE_ID=$(aws servicediscovery list-namespaces \
    --region us-east-2 \
    --query "Namespaces[?Name=='local'].Id" \
    --output text)

# Create service discovery service for CMS (if not already done)
aws servicediscovery create-service \
    --name chirp-cms \
    --dns-config "NamespaceId=$NAMESPACE_ID,DnsRecords=[{Type=A,TTL=60}]" \
    --health-check-custom-config FailureThreshold=1 \
    --region us-east-2
```

Then update your CMS ECS service to register with service discovery.

### 5. Run the Deployment

```bash
cd aws-deployment
chmod +x deploy.sh
./deploy.sh
```

The script will:

1. Create an ECR repository
2. Build and push the Docker image
3. Create CloudWatch log group
4. Register ECS task definition
5. Create Application Load Balancer (optional)
6. Create/update ECS service
7. Display deployment information

## Monitoring

### View Logs

```bash
# Real-time logs
aws logs tail /ecs/chirp-radio-frontend --follow --region us-east-2

# Specific time range
aws logs tail /ecs/chirp-radio-frontend \
    --since 1h \
    --region us-east-2
```

### Check Service Status

```bash
# Service overview
aws ecs describe-services \
    --cluster chirp-cluster \
    --services chirp-radio-frontend \
    --region us-east-2

# Running tasks
aws ecs list-tasks \
    --cluster chirp-cluster \
    --service-name chirp-radio-frontend \
    --region us-east-2

# Task details
aws ecs describe-tasks \
    --cluster chirp-cluster \
    --tasks TASK_ARN \
    --region us-east-2
```

## Updating the Application

To deploy a new version:

```bash
cd aws-deployment
./deploy.sh
```

The script will:

- Build a new image with a timestamp tag
- Push to ECR
- Update the service with `--force-new-deployment`
- ECS will perform a rolling update

## Troubleshooting

### Service won't start

1. Check CloudWatch logs:

   ```bash
   aws logs tail /ecs/chirp-radio-frontend --follow --region us-east-2
   ```

2. Check task stopped reason:
   ```bash
   aws ecs describe-tasks --cluster chirp-cluster --tasks TASK_ARN --region us-east-2
   ```

### Can't connect to CMS

1. Verify security group allows port 3000 between services
2. Check service discovery is configured
3. Test DNS resolution from frontend container:

   ```bash
   # Get into running container
   aws ecs execute-command \
       --cluster chirp-cluster \
       --task TASK_ID \
       --container chirp-radio-frontend \
       --interactive \
       --command "/bin/sh"

   # Then inside container:
   nslookup chirp-cms.local
   wget -O- http://chirp-cms.local:3000/api/health
   ```

### Load balancer health checks failing

1. Verify target group health check path is `/health`
2. Check security group allows traffic from ALB to containers
3. Verify container health check is passing:
   ```bash
   docker run -p 8080:80 YOUR_ECR_IMAGE
   curl http://localhost:8080/health
   ```

## Architecture

```
Internet
    ↓
Application Load Balancer (Port 80/443)
    ↓
ECS Service: chirp-radio-frontend (Port 80)
    ↓ /api/*
ECS Service: chirp-cms (Port 3000)
    ↓
Database (PostgreSQL/MongoDB)
```

## Cost Estimation

With default configuration (1 Fargate task, 0.25 vCPU, 512 MB):

- **Fargate**: ~$10-15/month
- **Application Load Balancer**: ~$16/month + data transfer
- **ECR**: $0.10/GB/month
- **CloudWatch Logs**: $0.50/GB ingested
- **Data Transfer**: Varies

**Total**: ~$30-40/month for basic setup

## Clean Up

To remove all resources:

```bash
# Delete ECS service
aws ecs delete-service \
    --cluster chirp-cluster \
    --service chirp-radio-frontend \
    --force \
    --region us-east-2

# Delete load balancer
aws elbv2 delete-load-balancer \
    --load-balancer-arn YOUR_ALB_ARN \
    --region us-east-2

# Delete target group
aws elbv2 delete-target-group \
    --target-group-arn YOUR_TG_ARN \
    --region us-east-2

# Delete ECR repository
aws ecr delete-repository \
    --repository-name chirp-radio-frontend \
    --force \
    --region us-east-2

# Delete log group
aws logs delete-log-group \
    --log-group-name /ecs/chirp-radio-frontend \
    --region us-east-2
```

## Additional Resources

- [AWS ECS Documentation](https://docs.aws.amazon.com/ecs/)
- [AWS Fargate Pricing](https://aws.amazon.com/fargate/pricing/)
- [ECS Service Discovery](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/service-discovery.html)
