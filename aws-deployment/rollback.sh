#!/bin/bash

# Rollback CHIRP Radio Frontend to previous version

set -e

AWS_REGION="us-east-2"
CLUSTER_NAME="chirp-cluster"
SERVICE_NAME="chirp-radio-frontend"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}CHIRP Radio Frontend - Rollback${NC}"

# Get current task definition
echo -e "\n${YELLOW}Getting current task definition...${NC}"
CURRENT_TASK_DEF=$(aws ecs describe-services \
    --cluster $CLUSTER_NAME \
    --services $SERVICE_NAME \
    --region $AWS_REGION \
    --query 'services[0].taskDefinition' \
    --output text)

echo "Current task definition: $CURRENT_TASK_DEF"

# List recent task definitions
echo -e "\n${YELLOW}Available task definitions:${NC}"
aws ecs list-task-definitions \
    --family-prefix chirp-radio-frontend \
    --sort DESC \
    --max-items 5 \
    --region $AWS_REGION \
    --query 'taskDefinitionArns[]' \
    --output table

# Ask which version to rollback to
echo -e "\n${YELLOW}Enter the task definition revision number to rollback to:${NC}"
read -p "Revision (e.g., 1, 2, 3): " REVISION

if [ -z "$REVISION" ]; then
    echo -e "${RED}Error: Revision number required${NC}"
    exit 1
fi

TARGET_TASK_DEF="chirp-radio-frontend:$REVISION"

# Confirm rollback
echo -e "\n${RED}WARNING: This will rollback the service to $TARGET_TASK_DEF${NC}"
read -p "Continue? (yes/no): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
    echo "Rollback cancelled"
    exit 0
fi

# Perform rollback
echo -e "\n${YELLOW}Rolling back service...${NC}"
aws ecs update-service \
    --cluster $CLUSTER_NAME \
    --service $SERVICE_NAME \
    --task-definition $TARGET_TASK_DEF \
    --force-new-deployment \
    --region $AWS_REGION

echo -e "${GREEN}✓ Rollback initiated${NC}"

# Monitor deployment
echo -e "\n${YELLOW}Monitoring deployment...${NC}"
echo "This may take a few minutes..."

for i in {1..30}; do
    RUNNING_COUNT=$(aws ecs describe-services \
        --cluster $CLUSTER_NAME \
        --services $SERVICE_NAME \
        --region $AWS_REGION \
        --query 'services[0].runningCount' \
        --output text)

    DESIRED_COUNT=$(aws ecs describe-services \
        --cluster $CLUSTER_NAME \
        --services $SERVICE_NAME \
        --region $AWS_REGION \
        --query 'services[0].desiredCount' \
        --output text)

    echo "Running: $RUNNING_COUNT / Desired: $DESIRED_COUNT"

    if [ "$RUNNING_COUNT" -eq "$DESIRED_COUNT" ]; then
        echo -e "${GREEN}✓ Rollback complete!${NC}"
        exit 0
    fi

    sleep 10
done

echo -e "${YELLOW}Deployment is taking longer than expected. Check status manually:${NC}"
echo "aws ecs describe-services --cluster $CLUSTER_NAME --services $SERVICE_NAME --region $AWS_REGION"
