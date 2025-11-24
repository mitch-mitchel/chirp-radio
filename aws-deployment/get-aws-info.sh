#!/bin/bash

# Helper script to gather AWS infrastructure information
# Run this to get the values you need for .env.ecs

set -e

AWS_REGION="us-east-2"
CLUSTER_NAME="chirp-cluster"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${GREEN}======================================${NC}"
echo -e "${GREEN}CHIRP AWS Infrastructure Information${NC}"
echo -e "${GREEN}======================================${NC}"

# AWS Account ID
echo -e "\n${YELLOW}1. AWS Account ID:${NC}"
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
echo -e "${BLUE}$AWS_ACCOUNT_ID${NC}"

# ECS Cluster Info
echo -e "\n${YELLOW}2. ECS Cluster:${NC}"
aws ecs describe-clusters \
    --clusters $CLUSTER_NAME \
    --region $AWS_REGION \
    --query 'clusters[0].[clusterName,status,registeredContainerInstancesCount,runningTasksCount]' \
    --output table 2>/dev/null || echo "Cluster not found"

# ECS Services in Cluster
echo -e "\n${YELLOW}3. ECS Services:${NC}"
SERVICE_ARNS=$(aws ecs list-services \
    --cluster $CLUSTER_NAME \
    --region $AWS_REGION \
    --query 'serviceArns[]' \
    --output text 2>/dev/null)

if [ -n "$SERVICE_ARNS" ]; then
    for SERVICE_ARN in $SERVICE_ARNS; do
        SERVICE_NAME=$(basename $SERVICE_ARN)
        echo -e "${BLUE}Service: $SERVICE_NAME${NC}"

        # Get service details
        aws ecs describe-services \
            --cluster $CLUSTER_NAME \
            --services $SERVICE_NAME \
            --region $AWS_REGION \
            --query 'services[0].[status,runningCount,desiredCount,launchType]' \
            --output table

        # Get network configuration
        echo "Network Configuration:"
        aws ecs describe-services \
            --cluster $CLUSTER_NAME \
            --services $SERVICE_NAME \
            --region $AWS_REGION \
            --query 'services[0].networkConfiguration.awsvpcConfiguration' \
            --output json
        echo ""
    done
else
    echo "No services found in cluster"
fi

# VPC Information
echo -e "\n${YELLOW}4. VPC Information:${NC}"
VPCS=$(aws ec2 describe-vpcs --region $AWS_REGION --query 'Vpcs[].[VpcId,Tags[?Key==`Name`].Value|[0],CidrBlock]' --output text)
echo "$VPCS" | while IFS=$'\t' read -r VPC_ID VPC_NAME VPC_CIDR; do
    echo -e "${BLUE}VPC ID:${NC} $VPC_ID"
    echo -e "${BLUE}Name:${NC} $VPC_NAME"
    echo -e "${BLUE}CIDR:${NC} $VPC_CIDR"
    echo ""
done

# Subnets
echo -e "\n${YELLOW}5. Subnets (you need at least 2 in different AZs):${NC}"
VPC_ID=$(aws ec2 describe-vpcs --region $AWS_REGION --query 'Vpcs[0].VpcId' --output text)
aws ec2 describe-subnets \
    --region $AWS_REGION \
    --filters "Name=vpc-id,Values=$VPC_ID" \
    --query 'Subnets[].[SubnetId,AvailabilityZone,CidrBlock,Tags[?Key==`Name`].Value|[0]]' \
    --output table

# Get subnet IDs as comma-separated list
SUBNET_IDS=$(aws ec2 describe-subnets \
    --region $AWS_REGION \
    --filters "Name=vpc-id,Values=$VPC_ID" \
    --query 'Subnets[].SubnetId' \
    --output text | tr '\t' ',')

# Security Groups
echo -e "\n${YELLOW}6. Security Groups:${NC}"
aws ec2 describe-security-groups \
    --region $AWS_REGION \
    --filters "Name=vpc-id,Values=$VPC_ID" \
    --query 'SecurityGroups[].[GroupId,GroupName,Description]' \
    --output table

# Get a common security group
SG_ID=$(aws ec2 describe-security-groups \
    --region $AWS_REGION \
    --filters "Name=vpc-id,Values=$VPC_ID" \
    --query 'SecurityGroups[0].GroupId' \
    --output text)

# ECR Repositories
echo -e "\n${YELLOW}7. ECR Repositories:${NC}"
aws ecr describe-repositories \
    --region $AWS_REGION \
    --query 'repositories[].[repositoryName,repositoryUri]' \
    --output table 2>/dev/null || echo "No repositories found"

# ACM Certificates
echo -e "\n${YELLOW}8. ACM Certificates (for HTTPS):${NC}"
aws acm list-certificates \
    --region $AWS_REGION \
    --query 'CertificateSummaryList[].[DomainName,CertificateArn]' \
    --output table 2>/dev/null || echo "No certificates found"

# Load Balancers
echo -e "\n${YELLOW}9. Load Balancers:${NC}"
aws elbv2 describe-load-balancers \
    --region $AWS_REGION \
    --query 'LoadBalancers[].[LoadBalancerName,DNSName,State.Code]' \
    --output table 2>/dev/null || echo "No load balancers found"

# Service Discovery Namespaces
echo -e "\n${YELLOW}10. Service Discovery Namespaces:${NC}"
aws servicediscovery list-namespaces \
    --region $AWS_REGION \
    --query 'Namespaces[].[Name,Id,Type]' \
    --output table 2>/dev/null || echo "No namespaces found"

# Summary for .env.ecs
echo -e "\n${GREEN}======================================${NC}"
echo -e "${GREEN}Summary for .env.ecs${NC}"
echo -e "${GREEN}======================================${NC}"
echo ""
echo "# Copy these values to .env.ecs:"
echo ""
echo "AWS_REGION=$AWS_REGION"
echo "AWS_ACCOUNT_ID=$AWS_ACCOUNT_ID"
echo "CLUSTER_NAME=$CLUSTER_NAME"
echo ""
echo "# Network Configuration (update with your values):"
echo "VPC_ID=$VPC_ID"
echo "SUBNET_IDS=$SUBNET_IDS"
echo "SECURITY_GROUP_ID=$SG_ID"
echo ""
echo "# CMS Service Name (check section 3 above):"
echo "CMS_SERVICE_NAME=chirp-cms  # UPDATE THIS if different"
echo ""

# Check if CMS is using service discovery
echo -e "\n${YELLOW}Checking CMS service discovery configuration...${NC}"
for SERVICE_ARN in $SERVICE_ARNS; do
    SERVICE_NAME=$(basename $SERVICE_ARN)
    DISCOVERY=$(aws ecs describe-services \
        --cluster $CLUSTER_NAME \
        --services $SERVICE_NAME \
        --region $AWS_REGION \
        --query 'services[0].serviceRegistries[]' \
        --output json)

    if [ "$DISCOVERY" != "[]" ] && [ "$DISCOVERY" != "null" ]; then
        echo -e "${GREEN}Service $SERVICE_NAME has service discovery enabled:${NC}"
        echo "$DISCOVERY" | jq
    fi
done

echo -e "\n${YELLOW}Next steps:${NC}"
echo "1. Copy the values above to .env.ecs"
echo "2. Verify the CMS_SERVICE_NAME matches your CMS service"
echo "3. Run ./setup-service-discovery.sh to enable service discovery"
echo "4. Run ./deploy.sh to deploy the frontend"
