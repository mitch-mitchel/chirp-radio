#!/bin/bash

# Setup AWS Cloud Map (Service Discovery) for ECS Services
# This allows frontend to connect to CMS using service names like "chirp-cms.local"

set -e

AWS_REGION="us-east-1"
NAMESPACE_NAME="local"
CMS_SERVICE_NAME="chirp-cms-service"
CLUSTER_NAME="chirp-cms-cluster"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}Setting up AWS Cloud Map Service Discovery${NC}"

# Get VPC ID from existing cluster
echo -e "\n${YELLOW}Getting VPC information...${NC}"
VPC_ID=$(aws ec2 describe-vpcs \
    --region $AWS_REGION \
    --query 'Vpcs[0].VpcId' \
    --output text)

if [ -z "$VPC_ID" ]; then
    echo "Error: Could not find VPC"
    exit 1
fi

echo -e "${GREEN}✓ Found VPC: $VPC_ID${NC}"

# Check if namespace exists
echo -e "\n${YELLOW}Checking for existing namespace...${NC}"
NAMESPACE_ID=$(aws servicediscovery list-namespaces \
    --region $AWS_REGION \
    --query "Namespaces[?Name=='$NAMESPACE_NAME'].Id" \
    --output text 2>/dev/null)

if [ -z "$NAMESPACE_ID" ]; then
    echo "Creating private DNS namespace '$NAMESPACE_NAME'..."
    NAMESPACE_ID=$(aws servicediscovery create-private-dns-namespace \
        --name $NAMESPACE_NAME \
        --vpc $VPC_ID \
        --region $AWS_REGION \
        --query 'OperationId' \
        --output text)

    # Wait for namespace creation
    echo "Waiting for namespace creation..."
    sleep 10

    # Get the actual namespace ID
    NAMESPACE_ID=$(aws servicediscovery list-namespaces \
        --region $AWS_REGION \
        --query "Namespaces[?Name=='$NAMESPACE_NAME'].Id" \
        --output text)
fi

echo -e "${GREEN}✓ Namespace ID: $NAMESPACE_ID${NC}"

# Create service discovery service for CMS
echo -e "\n${YELLOW}Setting up service discovery for CMS...${NC}"
CMS_DISCOVERY_ARN=$(aws servicediscovery list-services \
    --region $AWS_REGION \
    --filters "Name=NAMESPACE_ID,Values=$NAMESPACE_ID,Condition=EQ" \
    --query "Services[?Name=='$CMS_SERVICE_NAME'].Arn" \
    --output text 2>/dev/null)

if [ -z "$CMS_DISCOVERY_ARN" ]; then
    echo "Creating service discovery for $CMS_SERVICE_NAME..."
    CMS_DISCOVERY_ARN=$(aws servicediscovery create-service \
        --name $CMS_SERVICE_NAME \
        --dns-config "NamespaceId=$NAMESPACE_ID,DnsRecords=[{Type=A,TTL=60}]" \
        --health-check-custom-config FailureThreshold=1 \
        --region $AWS_REGION \
        --query 'Service.Arn' \
        --output text)
fi

echo -e "${GREEN}✓ CMS Discovery ARN: $CMS_DISCOVERY_ARN${NC}"

# Create service discovery service for Frontend
echo -e "\n${YELLOW}Setting up service discovery for Frontend...${NC}"
FRONTEND_SERVICE_NAME="chirp-radio-frontend"
FRONTEND_DISCOVERY_ARN=$(aws servicediscovery list-services \
    --region $AWS_REGION \
    --filters "Name=NAMESPACE_ID,Values=$NAMESPACE_ID,Condition=EQ" \
    --query "Services[?Name=='$FRONTEND_SERVICE_NAME'].Arn" \
    --output text 2>/dev/null)

if [ -z "$FRONTEND_DISCOVERY_ARN" ]; then
    echo "Creating service discovery for $FRONTEND_SERVICE_NAME..."
    FRONTEND_DISCOVERY_ARN=$(aws servicediscovery create-service \
        --name $FRONTEND_SERVICE_NAME \
        --dns-config "NamespaceId=$NAMESPACE_ID,DnsRecords=[{Type=A,TTL=60}]" \
        --health-check-custom-config FailureThreshold=1 \
        --region $AWS_REGION \
        --query 'Service.Arn' \
        --output text)
fi

echo -e "${GREEN}✓ Frontend Discovery ARN: $FRONTEND_DISCOVERY_ARN${NC}"

# Display summary
echo -e "\n${GREEN}======================================${NC}"
echo -e "${GREEN}Service Discovery Setup Complete${NC}"
echo -e "${GREEN}======================================${NC}"
echo -e "Namespace: ${GREEN}$NAMESPACE_NAME${NC}"
echo -e "Namespace ID: ${GREEN}$NAMESPACE_ID${NC}"
echo -e "CMS Discovery ARN: ${GREEN}$CMS_DISCOVERY_ARN${NC}"
echo -e "Frontend Discovery ARN: ${GREEN}$FRONTEND_DISCOVERY_ARN${NC}"

echo -e "\n${YELLOW}Next Steps:${NC}"
echo "1. Update your CMS ECS service to register with service discovery:"
echo "   aws ecs update-service \\"
echo "       --cluster $CLUSTER_NAME \\"
echo "       --service <YOUR_CMS_SERVICE_NAME> \\"
echo "       --service-registries registryArn=$CMS_DISCOVERY_ARN \\"
echo "       --region $AWS_REGION"
echo ""
echo "2. Update deploy.sh to use this discovery ARN for the frontend service"
echo ""
echo "3. Services can now communicate using:"
echo "   - CMS: http://$CMS_SERVICE_NAME.$NAMESPACE_NAME:3000"
echo "   - Frontend: http://$FRONTEND_SERVICE_NAME.$NAMESPACE_NAME:80"
