# Quick Start - Deploy CHIRP Radio Frontend to AWS ECS

Follow these steps to deploy the frontend to AWS ECS and connect it to your CMS.

## Prerequisites

- AWS CLI configured (`aws configure`)
- Docker installed
- Your CMS already running on ECS

## Step 1: Gather AWS Information

Run the helper script to get your infrastructure details:

```bash
cd aws-deployment
./get-aws-info.sh
```

This will display:

- AWS Account ID
- ECS cluster and services
- VPC and subnet IDs
- Security groups
- Your CMS service name

## Step 2: Configure Deployment

Copy the values from Step 1 into `.env.ecs`:

```bash
# Edit .env.ecs with your values
VPC_ID=vpc-xxxxx
SUBNET_IDS=subnet-xxxxx,subnet-yyyyy
SECURITY_GROUP_ID=sg-xxxxx
CMS_SERVICE_NAME=chirp-cms  # Your actual CMS service name
```

## Step 3: Update Nginx Configuration

Edit `nginx.ecs.conf` in the project root and update line 47:

```nginx
# Change this line to match your CMS service name
proxy_pass http://chirp-cms.local:3000;
#                   ^^^^^^^^^ Update this to your CMS service name
```

## Step 4: Set Up Service Discovery

This allows the frontend and CMS to communicate by name:

```bash
./setup-service-discovery.sh
```

## Step 5: Update Security Group

Ensure your security group allows:

- Port 80 (HTTP) from the internet
- Port 443 (HTTPS) from the internet (if using HTTPS)
- Port 3000 from the security group to itself (for CMS communication)

```bash
# Allow HTTP
aws ec2 authorize-security-group-ingress \
    --group-id YOUR_SG_ID \
    --protocol tcp --port 80 --cidr 0.0.0.0/0 \
    --region us-east-2

# Allow HTTPS (optional)
aws ec2 authorize-security-group-ingress \
    --group-id YOUR_SG_ID \
    --protocol tcp --port 443 --cidr 0.0.0.0/0 \
    --region us-east-2

# Allow CMS communication
aws ec2 authorize-security-group-ingress \
    --group-id YOUR_SG_ID \
    --protocol tcp --port 3000 --source-group YOUR_SG_ID \
    --region us-east-2
```

## Step 6: Deploy!

Run the deployment script:

```bash
./deploy.sh
```

This will:

1. Create ECR repository
2. Build and push Docker image
3. Create CloudWatch logs
4. Register ECS task definition
5. Create Application Load Balancer
6. Deploy the ECS service

## Step 7: Verify Deployment

Check the service status:

```bash
aws ecs describe-services \
    --cluster chirp-cluster \
    --services chirp-radio-frontend \
    --region us-east-2
```

View logs:

```bash
aws logs tail /ecs/chirp-radio-frontend --follow --region us-east-2
```

Get the load balancer URL:

```bash
aws elbv2 describe-load-balancers \
    --names chirp-radio-alb \
    --region us-east-2 \
    --query 'LoadBalancers[0].DNSName' \
    --output text
```

## Troubleshooting

### Service won't start

Check CloudWatch logs:

```bash
aws logs tail /ecs/chirp-radio-frontend --follow --region us-east-2
```

### Can't connect to CMS

1. Verify service discovery is set up (`./get-aws-info.sh` - check section 10)
2. Check security group allows port 3000
3. Verify nginx.ecs.conf has correct CMS service name

### Health checks failing

1. Test locally first:

   ```bash
   docker build -f Dockerfile.ecs -t test .
   docker run -p 8080:80 test
   curl http://localhost:8080/health
   ```

2. Check target group health in AWS Console

## Next Steps

- Set up a custom domain name
- Configure HTTPS with ACM certificate
- Set up auto-scaling
- Configure CI/CD pipeline

## Rolling Back

If something goes wrong:

```bash
./rollback.sh
```

This will revert to the previous task definition.

## Need Help?

See the full README.md for detailed documentation and troubleshooting.
