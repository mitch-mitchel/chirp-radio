#!/bin/bash

# CHIRP Radio Frontend - ECS Deployment Script
# This script deploys the CHIRP Radio frontend to AWS ECS

set -e

# Configuration - UPDATE THESE VALUES
AWS_REGION="us-east-1"
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
CLUSTER_NAME="chirp-cms-cluster"
SERVICE_NAME="chirp-radio-frontend"
TASK_FAMILY="chirp-radio-frontend"
ECR_REPO_NAME="chirp-radio-frontend"
CONTAINER_NAME="chirp-radio-frontend"
CONTAINER_PORT=80

# CMS Configuration - From existing CMS service
CMS_SERVICE_NAME="chirp-cms-service"
CMS_PORT=3000

# Network Configuration - From existing CMS service
VPC_ID="vpc-0f5eb1acd7edc4e58"
SUBNET_IDS="subnet-0f49fc51066a96cb0,subnet-03d8b951063d2fa16"
SECURITY_GROUP_ID="sg-0e2e7300d975dd141"

# Load Balancer Configuration (Optional)
# Leave empty if you don't want to create/use an ALB
CREATE_ALB="true"
ALB_NAME="chirp-radio-alb"
TARGET_GROUP_NAME="chirp-radio-tg"
CERTIFICATE_ARN=""  # Optional: ACM certificate ARN for HTTPS

# Resource Configuration
CPU="256"  # 0.25 vCPU
MEMORY="512"  # 512 MB
DESIRED_COUNT=1

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}======================================${NC}"
echo -e "${GREEN}CHIRP Radio Frontend - ECS Deployment${NC}"
echo -e "${GREEN}======================================${NC}"

# Validate required variables
if [ -z "$VPC_ID" ] || [ -z "$SUBNET_IDS" ] || [ -z "$SECURITY_GROUP_ID" ]; then
    echo -e "${RED}Error: Please update VPC_ID, SUBNET_IDS, and SECURITY_GROUP_ID in this script${NC}"
    echo "You can find these values from your existing CMS deployment"
    exit 1
fi

# Step 1: Create ECR repository if it doesn't exist
echo -e "\n${YELLOW}Step 1: Creating ECR repository...${NC}"
aws ecr describe-repositories --repository-names $ECR_REPO_NAME --region $AWS_REGION 2>/dev/null || \
    aws ecr create-repository \
        --repository-name $ECR_REPO_NAME \
        --region $AWS_REGION \
        --image-scanning-configuration scanOnPush=true

ECR_URI="$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPO_NAME"
echo -e "${GREEN}✓ ECR repository: $ECR_URI${NC}"

# Step 2: Build and push Docker image
echo -e "\n${YELLOW}Step 2: Building and pushing Docker image...${NC}"

# Login to ECR
aws ecr get-login-password --region $AWS_REGION | \
    docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com

# Build image with CMS API URL
# Using service discovery format: http://<service-name>.<namespace>:<port>
# We'll use a generic format that works with service discovery
docker build \
    --build-arg VITE_USE_CMS_API=true \
    --build-arg VITE_CMS_API_URL=/api \
    -t $ECR_REPO_NAME:latest \
    -f ../Dockerfile.ecs \
    ..

# Tag and push
docker tag $ECR_REPO_NAME:latest $ECR_URI:latest
docker tag $ECR_REPO_NAME:latest $ECR_URI:$(date +%Y%m%d-%H%M%S)
docker push $ECR_URI:latest
docker push $ECR_URI:$(date +%Y%m%d-%H%M%S)

echo -e "${GREEN}✓ Image pushed to ECR${NC}"

# Step 3: Create CloudWatch Log Group
echo -e "\n${YELLOW}Step 3: Creating CloudWatch log group...${NC}"
aws logs create-log-group \
    --log-group-name /ecs/$TASK_FAMILY \
    --region $AWS_REGION 2>/dev/null || echo "Log group already exists"
echo -e "${GREEN}✓ Log group created${NC}"

# Step 4: Verify nginx configuration exists
echo -e "\n${YELLOW}Step 4: Verifying nginx configuration...${NC}"
if [ ! -f ../nginx.ecs.conf ]; then
    echo -e "${RED}Error: nginx.ecs.conf not found!${NC}"
    echo "Please ensure nginx.ecs.conf exists in the project root"
    echo "and update the CMS service name to: ${CMS_SERVICE_NAME}.local:${CMS_PORT}"
    exit 1
fi
echo -e "${GREEN}✓ Nginx configuration found${NC}"

# Step 5: Register Task Definition
echo -e "\n${YELLOW}Step 5: Registering ECS task definition...${NC}"
cat > task-definition.json << EOF
{
  "family": "$TASK_FAMILY",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "$CPU",
  "memory": "$MEMORY",
  "executionRoleArn": "arn:aws:iam::$AWS_ACCOUNT_ID:role/ecsTaskExecutionRole",
  "containerDefinitions": [
    {
      "name": "$CONTAINER_NAME",
      "image": "$ECR_URI:latest",
      "essential": true,
      "portMappings": [
        {
          "containerPort": $CONTAINER_PORT,
          "protocol": "tcp"
        }
      ],
      "environment": [
        {
          "name": "NODE_ENV",
          "value": "production"
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/$TASK_FAMILY",
          "awslogs-region": "$AWS_REGION",
          "awslogs-stream-prefix": "ecs"
        }
      },
      "healthCheck": {
        "command": ["CMD-SHELL", "wget --quiet --tries=1 --spider http://localhost/health || exit 1"],
        "interval": 30,
        "timeout": 5,
        "retries": 3,
        "startPeriod": 60
      }
    }
  ]
}
EOF

aws ecs register-task-definition \
    --cli-input-json file://task-definition.json \
    --region $AWS_REGION

echo -e "${GREEN}✓ Task definition registered${NC}"

# Step 6: Create Application Load Balancer (if configured)
if [ "$CREATE_ALB" = "true" ]; then
    echo -e "\n${YELLOW}Step 6: Setting up Application Load Balancer...${NC}"

    # Create ALB
    ALB_ARN=$(aws elbv2 create-load-balancer \
        --name $ALB_NAME \
        --subnets $(echo $SUBNET_IDS | tr ',' ' ') \
        --security-groups $SECURITY_GROUP_ID \
        --scheme internet-facing \
        --type application \
        --ip-address-type ipv4 \
        --region $AWS_REGION \
        --query 'LoadBalancers[0].LoadBalancerArn' \
        --output text 2>/dev/null || \
        aws elbv2 describe-load-balancers \
            --names $ALB_NAME \
            --region $AWS_REGION \
            --query 'LoadBalancers[0].LoadBalancerArn' \
            --output text)

    echo -e "${GREEN}✓ ALB: $ALB_ARN${NC}"

    # Create Target Group
    TG_ARN=$(aws elbv2 create-target-group \
        --name $TARGET_GROUP_NAME \
        --protocol HTTP \
        --port $CONTAINER_PORT \
        --vpc-id $VPC_ID \
        --target-type ip \
        --health-check-path /health \
        --health-check-interval-seconds 30 \
        --health-check-timeout-seconds 5 \
        --healthy-threshold-count 2 \
        --unhealthy-threshold-count 3 \
        --region $AWS_REGION \
        --query 'TargetGroups[0].TargetGroupArn' \
        --output text 2>/dev/null || \
        aws elbv2 describe-target-groups \
            --names $TARGET_GROUP_NAME \
            --region $AWS_REGION \
            --query 'TargetGroups[0].TargetGroupArn' \
            --output text)

    echo -e "${GREEN}✓ Target Group: $TG_ARN${NC}"

    # Create Listener
    if [ -n "$CERTIFICATE_ARN" ]; then
        # HTTPS Listener
        aws elbv2 create-listener \
            --load-balancer-arn $ALB_ARN \
            --protocol HTTPS \
            --port 443 \
            --certificates CertificateArn=$CERTIFICATE_ARN \
            --default-actions Type=forward,TargetGroupArn=$TG_ARN \
            --region $AWS_REGION 2>/dev/null || echo "HTTPS Listener already exists"

        # HTTP to HTTPS redirect
        aws elbv2 create-listener \
            --load-balancer-arn $ALB_ARN \
            --protocol HTTP \
            --port 80 \
            --default-actions Type=redirect,RedirectConfig="{Protocol=HTTPS,Port=443,StatusCode=HTTP_301}" \
            --region $AWS_REGION 2>/dev/null || echo "HTTP Listener already exists"
    else
        # HTTP Listener only
        aws elbv2 create-listener \
            --load-balancer-arn $ALB_ARN \
            --protocol HTTP \
            --port 80 \
            --default-actions Type=forward,TargetGroupArn=$TG_ARN \
            --region $AWS_REGION 2>/dev/null || echo "HTTP Listener already exists"
    fi

    echo -e "${GREEN}✓ Listener created${NC}"
else
    echo -e "\n${YELLOW}Step 6: Skipping ALB setup (CREATE_ALB=false)${NC}"
    TG_ARN=""
fi

# Step 7: Create or Update ECS Service
echo -e "\n${YELLOW}Step 7: Creating/Updating ECS service...${NC}"

# Check if service exists
SERVICE_EXISTS=$(aws ecs describe-services \
    --cluster $CLUSTER_NAME \
    --services $SERVICE_NAME \
    --region $AWS_REGION \
    --query 'services[0].status' \
    --output text 2>/dev/null)

if [ "$SERVICE_EXISTS" = "ACTIVE" ]; then
    echo "Service exists, updating..."
    aws ecs update-service \
        --cluster $CLUSTER_NAME \
        --service $SERVICE_NAME \
        --task-definition $TASK_FAMILY \
        --desired-count $DESIRED_COUNT \
        --force-new-deployment \
        --region $AWS_REGION
else
    echo "Creating new service..."

    # Build service creation command
    SERVICE_CMD="aws ecs create-service \
        --cluster $CLUSTER_NAME \
        --service-name $SERVICE_NAME \
        --task-definition $TASK_FAMILY \
        --desired-count $DESIRED_COUNT \
        --launch-type FARGATE \
        --network-configuration awsvpcConfiguration={subnets=[$SUBNET_IDS],securityGroups=[$SECURITY_GROUP_ID],assignPublicIp=ENABLED} \
        --region $AWS_REGION"

    # Add load balancer if configured
    if [ -n "$TG_ARN" ]; then
        SERVICE_CMD="$SERVICE_CMD \
            --load-balancers targetGroupArn=$TG_ARN,containerName=$CONTAINER_NAME,containerPort=$CONTAINER_PORT"
    fi

    # Add service discovery (recommended for ECS-to-ECS communication)
    # You may need to create a service discovery namespace first
    # SERVICE_CMD="$SERVICE_CMD \
    #     --service-registries registryArn=<SERVICE_DISCOVERY_ARN>,containerName=$CONTAINER_NAME"

    eval $SERVICE_CMD
fi

echo -e "${GREEN}✓ ECS service created/updated${NC}"

# Step 8: Display deployment info
echo -e "\n${GREEN}======================================${NC}"
echo -e "${GREEN}Deployment Summary${NC}"
echo -e "${GREEN}======================================${NC}"
echo -e "Cluster: ${GREEN}$CLUSTER_NAME${NC}"
echo -e "Service: ${GREEN}$SERVICE_NAME${NC}"
echo -e "Task Definition: ${GREEN}$TASK_FAMILY${NC}"
echo -e "ECR Image: ${GREEN}$ECR_URI:latest${NC}"

if [ -n "$ALB_ARN" ]; then
    ALB_DNS=$(aws elbv2 describe-load-balancers \
        --load-balancer-arns $ALB_ARN \
        --region $AWS_REGION \
        --query 'LoadBalancers[0].DNSName' \
        --output text)
    echo -e "Load Balancer: ${GREEN}$ALB_DNS${NC}"
    echo -e "\n${YELLOW}Access your application at: http://$ALB_DNS${NC}"
fi

echo -e "\n${YELLOW}Monitoring:${NC}"
echo -e "CloudWatch Logs: /ecs/$TASK_FAMILY"
echo -e "\nView service status:"
echo -e "  aws ecs describe-services --cluster $CLUSTER_NAME --services $SERVICE_NAME --region $AWS_REGION"

echo -e "\n${GREEN}Deployment complete!${NC}"
