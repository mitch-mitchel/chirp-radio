# AWS Cloud Map Service Discovery Setup

## Overview

The CHIRP Radio ECS deployment uses AWS Cloud Map (Service Discovery) to enable secure, direct communication between the frontend (chirp-radio-frontend) and backend (chirp-cms) services without going through the Application Load Balancer.

## Architecture

```
┌─────────────────────┐
│   Internet Users    │
└──────────┬──────────┘
           │
           ▼
    ┌──────────────┐
    │  ALB (Public)│
    └──────┬───────┘
           │
           ▼
┌─────────────────────────┐
│ chirp-radio-frontend    │
│ (nginx + static assets) │
└──────────┬──────────────┘
           │
           │ Service Discovery
           │ (chirp-cms-service.local:3000)
           │
           ▼
┌─────────────────────────┐
│   chirp-cms-service     │
│   (CMS Backend API)     │
└─────────────────────────┘
```

## Benefits of Service Discovery

1. **Direct Communication**: Services communicate directly without ALB overhead
2. **Lower Latency**: Eliminates extra network hop through load balancer
3. **Cost Savings**: Reduced ALB data transfer charges for internal traffic
4. **Better Security**: Internal traffic stays within VPC
5. **Automatic DNS**: AWS manages DNS records as containers scale up/down

## Current Configuration

### Namespace

- **Name**: `local`
- **Type**: Private DNS (VPC-only)
- **ID**: `ns-i445afyizmjuuk3q`

### Service Discovery Services

#### 1. chirp-cms-service

- **DNS Name**: `chirp-cms-service.local`
- **Port**: 3000
- **ARN**: `arn:aws:servicediscovery:us-east-1:622631872953:service/srv-cf2b5pg32vjb6cjh`

#### 2. chirp-radio-frontend

- **DNS Name**: `chirp-radio-frontend.local`
- **Port**: 80
- **ARN**: `arn:aws:servicediscovery:us-east-1:622631872953:service/srv-q335b27vwsj7hiio`

## How It Works

1. **DNS Resolution**: When the frontend container makes a request to `chirp-cms-service.local`, AWS Route 53 resolves it to the private IP address(es) of the CMS container(s)

2. **Health Checks**: AWS monitors container health and only returns healthy instances

3. **Load Distribution**: If multiple CMS containers are running, requests are distributed across them

4. **Dynamic Updates**: As containers start/stop, DNS records are automatically updated

## nginx Configuration

The frontend nginx is configured to proxy API requests to the CMS using service discovery:

```nginx
location /api/ {
    proxy_pass http://chirp-cms-service.local:3000;
    # ... other proxy settings
}
```

## Deployment Scripts

### setup-service-discovery.sh

Creates the Cloud Map namespace and service discovery services. This only needs to be run once.

```bash
./setup-service-discovery.sh
```

### deploy.sh

The deployment script now automatically:

1. Checks for service discovery configuration
2. Registers the service with service discovery
3. Validates nginx configuration

## Verifying Service Discovery

### Check namespace exists:

```bash
aws servicediscovery list-namespaces \
    --region us-east-1 \
    --query "Namespaces[?Name=='local']"
```

### Check services:

```bash
aws servicediscovery list-services \
    --region us-east-1 \
    --filters "Name=NAMESPACE_ID,Values=ns-i445afyizmjuuk3q,Condition=EQ"
```

### Check ECS service registration:

```bash
aws ecs describe-services \
    --cluster chirp-cms-cluster \
    --services chirp-cms-service chirp-radio-frontend \
    --region us-east-1 \
    --query 'services[*].{Name:serviceName,ServiceRegistries:serviceRegistries}'
```

### Test DNS resolution from within a container:

```bash
# Get a shell in the frontend container
aws ecs execute-command \
    --cluster chirp-cms-cluster \
    --task <TASK-ID> \
    --container chirp-radio-frontend \
    --interactive \
    --command "/bin/sh"

# Test DNS resolution
nslookup chirp-cms-service.local
curl http://chirp-cms-service.local:3000/health
```

## Troubleshooting

### DNS not resolving

- Ensure both services are in the same VPC
- Verify security groups allow traffic between services
- Check that services are registered with service discovery

### Connection refused

- Verify the CMS service is running and healthy
- Check security group rules allow port 3000 traffic
- Ensure the CMS container is listening on 0.0.0.0:3000

### Nginx shows 502 Bad Gateway

- Check CloudWatch logs for both services
- Verify the upstream service (CMS) is healthy
- Test DNS resolution from within the frontend container

## Security Considerations

### Security Groups

Both services should be in security groups that allow:

- Frontend → CMS: Port 3000
- CMS → Frontend: Not required (one-way communication)

### Network ACLs

Ensure VPC Network ACLs allow traffic between subnets where containers run.

### IAM Permissions

The ECS task execution role needs:

- `servicediscovery:DiscoverInstances` (automatically granted)
- Standard ECS task execution permissions

## Monitoring

### CloudWatch Metrics

Monitor these metrics for service discovery:

- `DiscoverInstances` API calls
- DNS query rates via Route 53

### ECS Service Metrics

- Healthy task count
- Target response time
- 5xx error rates

## Cost Considerations

Service Discovery pricing (as of 2024):

- Namespace: Free
- Service Discovery Service: $0.10/month per service
- DNS queries: First 1 billion/month included with namespace

**Total monthly cost**: ~$0.20 for 2 services (negligible)

**Savings**: Reduced ALB data transfer costs for internal traffic

## Next Steps

1. Monitor application logs to ensure API calls succeed
2. Consider setting up X-Ray tracing for service-to-service calls
3. Implement circuit breakers if needed for resilience
4. Add CloudWatch alarms for service health

## References

- [AWS Cloud Map Documentation](https://docs.aws.amazon.com/cloud-map/)
- [ECS Service Discovery](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/service-discovery.html)
