import * as cdk from "aws-cdk-lib";
import { Duration, RemovalPolicy } from "aws-cdk-lib";
import * as apigatewayv2 from "aws-cdk-lib/aws-apigatewayv2";
import * as integrations from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as appsync from "aws-cdk-lib/aws-appsync";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as fis from "aws-cdk-lib/aws-fis";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as nodejs from "aws-cdk-lib/aws-lambda-nodejs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as sagemaker from "aws-cdk-lib/aws-sagemaker";
import * as sns from "aws-cdk-lib/aws-sns";
import * as subscriptions from "aws-cdk-lib/aws-sns-subscriptions";
import { Construct } from "constructs";
import path from "node:path";
import { fileURLToPath } from "node:url";

interface SeismicSentryStackProps extends cdk.StackProps {
  environmentName: string;
}

export class SeismicSentryStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: SeismicSentryStackProps) {
    super(scope, id, props);

    const allowedCorsOrigin = this.node.tryGetContext("allowedCorsOrigin") ?? "https://d1zssbg0orn82l.cloudfront.net";
    const alertEmail = this.node.tryGetContext("alertEmail") ?? "";
    const enableSageMaker = this.node.tryGetContext("enableSageMaker") === "true";
    const demoAdminTokenSha256 = this.node.tryGetContext("demoAdminTokenSha256") ?? "";
    const modelAucRoc = this.node.tryGetContext("modelAucRoc") ?? "";
    const modelFeatureImportance = this.node.tryGetContext("modelFeatureImportance") ?? "";
    const modelVersion = this.node.tryGetContext("modelVersion") ?? "";
    const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

    const siteBucket = new s3.Bucket(this, "DashboardBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true
    });

    const responseHeadersPolicy = new cloudfront.ResponseHeadersPolicy(this, "DashboardSecurityHeaders", {
      securityHeadersBehavior: {
        contentSecurityPolicy: {
          contentSecurityPolicy:
            "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; " +
            "script-src 'self' blob:; worker-src blob:; child-src blob:; " +
            "style-src 'self' 'unsafe-inline' https://api.mapbox.com; " +
            "img-src 'self' data: blob: https://api.mapbox.com https://*.tiles.mapbox.com; " +
            `connect-src 'self' https://*.execute-api.${this.region}.amazonaws.com https://api.mapbox.com https://events.mapbox.com https://*.tiles.mapbox.com ` +
            `https://*.appsync-api.${this.region}.amazonaws.com wss://*.appsync-realtime-api.${this.region}.amazonaws.com; ` +
            "font-src 'self' data:; form-action 'self';",
          override: true
        },
        contentTypeOptions: { override: true },
        frameOptions: { frameOption: cloudfront.HeadersFrameOption.DENY, override: true },
        referrerPolicy: { referrerPolicy: cloudfront.HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN, override: true },
        strictTransportSecurity: {
          accessControlMaxAge: Duration.days(365),
          includeSubdomains: true,
          preload: true,
          override: true
        },
        xssProtection: { protection: true, modeBlock: true, override: true }
      },
      customHeadersBehavior: {
        customHeaders: [
          {
            header: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
            override: true
          }
        ]
      }
    });

    const distribution = new cloudfront.Distribution(this, "DashboardDistribution", {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(siteBucket),
        responseHeadersPolicy,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS
      },
      defaultRootObject: "index.html",
      errorResponses: [
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: "/index.html"
        }
      ]
    });

    const sitesTable = new dynamodb.Table(this, "SitesTable", {
      partitionKey: { name: "pk", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "sk", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: RemovalPolicy.DESTROY
    });
    sitesTable.addGlobalSecondaryIndex({
      indexName: "RegionIndex",
      partitionKey: { name: "gsi1pk", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "gsi1sk", type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL
    });

    const resultsTable = new dynamodb.Table(this, "ResultsTable", {
      partitionKey: { name: "pk", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "sk", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      timeToLiveAttribute: "expiresAt",
      removalPolicy: RemovalPolicy.DESTROY
    });

    const alertTopic = new sns.Topic(this, "EmergencyAlertTopic", {
      displayName: `SeismicSentry ${props.environmentName} emergency alerts`
    });

    const fisConfigBucket = new s3.Bucket(this, "FisConfigBucket", {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      encryption: s3.BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true
    });

    if (alertEmail) {
      alertTopic.addSubscription(new subscriptions.EmailSubscription(alertEmail));
    }

    const apiRole = new iam.Role(this, "ApiLambdaRole", {
      assumedBy: new iam.ServicePrincipal("lambda.amazonaws.com"),
      managedPolicies: [iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole")]
    });
    const sageMakerEndpointArn = cdk.Stack.of(this).formatArn({
      service: "sagemaker",
      resource: "endpoint",
      resourceName: `${id.toLowerCase()}-endpoint`
    });
    resultsTable.grantReadWriteData(apiRole);
    sitesTable.grantReadWriteData(apiRole);
    alertTopic.grantPublish(apiRole);
    fisConfigBucket.grantReadWrite(apiRole);
    apiRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["sagemaker:InvokeEndpoint"],
        resources: [sageMakerEndpointArn]
      })
    );

    const commonEnvironment = {
      CORS_ALLOW_ORIGIN: allowedCorsOrigin,
      RESULTS_TABLE_NAME: resultsTable.tableName,
      SITES_TABLE_NAME: sitesTable.tableName,
      ALERT_TOPIC_ARN: alertTopic.topicArn,
      SAGEMAKER_ENDPOINT_NAME: `${id.toLowerCase()}-endpoint`,
      STACK_NAME: id,
      USE_LOCAL_INFERENCE: enableSageMaker ? "false" : "true",
      RESPONSE_RESULT_LIMIT: "1000",
      REGION_INDEX_NAME: "RegionIndex",
      MODEL_NAME: "SeismicSentry GBT Failure Model",
      MODEL_VERSION: modelVersion || `${id.toLowerCase()}-endpoint`,
      MODEL_AUC_ROC: modelAucRoc,
      MODEL_FEATURE_IMPORTANCE: modelFeatureImportance,
      SAGEMAKER_BATCH_SIZE: "5000",
      DEMO_ADMIN_TOKEN_SHA256: demoAdminTokenSha256,
      AWS_FIS_CONFIGURATION_LOCATION: `arn:aws:s3:::${fisConfigBucket.bucketName}/awsfis`
    };

    const fisLambdaExtensionLayer = lambda.LayerVersion.fromLayerVersionArn(
      this,
      "FisLambdaExtensionLayer",
      `arn:aws:lambda:${cdk.Stack.of(this).region}:975050054544:layer:aws-fis-extension-x86_64:287`
    );

    const health = new nodejs.NodejsFunction(this, "HealthFunction", {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "handler",
      entry: path.join(repoRoot, "services/api/src/health.ts"),
      role: apiRole,
      timeout: Duration.seconds(5),
      memorySize: 256,
      bundling: {
        sourceMap: true,
        target: "node20"
      },
      environment: commonEnvironment
    });

    const catalog = new nodejs.NodejsFunction(this, "CatalogFunction", {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "handler",
      entry: path.join(repoRoot, "services/api/src/catalog.ts"),
      role: apiRole,
      timeout: Duration.seconds(10),
      memorySize: 512,
      bundling: {
        sourceMap: true,
        target: "node20"
      },
      environment: commonEnvironment
    });

    const orchestrator = new nodejs.NodejsFunction(this, "ScenarioOrchestratorFunction", {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "handler",
      entry: path.join(repoRoot, "services/api/src/orchestrator.ts"),
      role: apiRole,
      timeout: Duration.seconds(30),
      memorySize: 1024,
      bundling: {
        sourceMap: true,
        target: "node20"
      },
      layers: [fisLambdaExtensionLayer],
      environment: commonEnvironment
    });

    const report = new nodejs.NodejsFunction(this, "ReportFunction", {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "handler",
      entry: path.join(repoRoot, "services/api/src/report.ts"),
      role: apiRole,
      timeout: Duration.seconds(30),
      memorySize: 1024,
      bundling: {
        sourceMap: true,
        target: "node20"
      },
      environment: commonEnvironment
    });

    const fisRole = new iam.Role(this, "FisExperimentRole", {
      assumedBy: new iam.ServicePrincipal("fis.amazonaws.com")
    });
    fisConfigBucket.grantReadWrite(fisRole);
    fisRole.addToPolicy(
      new iam.PolicyStatement({
        actions: [
          "lambda:GetFunction",
          "lambda:GetFunctionConfiguration",
          "lambda:ListAliases",
          "lambda:ListVersionsByFunction",
          "lambda:GetAlias",
          "lambda:PutFunctionConcurrency",
          "lambda:DeleteFunctionConcurrency"
        ],
        resources: [orchestrator.functionArn, `${orchestrator.functionArn}:*`]
      })
    );

    const fisExperimentTemplate = new fis.CfnExperimentTemplate(this, "FisExperimentTemplate", {
      description: `SeismicSentry ${props.environmentName} primary-region degradation experiment`,
      roleArn: fisRole.roleArn,
      stopConditions: [{ source: "none" }],
      targets: {
        ApiLambda: {
          resourceType: "aws:lambda:function",
          resourceArns: [orchestrator.functionArn],
          selectionMode: "ALL"
        }
      },
      actions: {
        ThrottleLambdaConcurrency: {
          actionId: "aws:lambda:invocation-add-delay",
          description: "Simulate primary API degradation during earthquake response",
          parameters: {
            duration: "PT2M",
            invocationPercentage: "100",
            startupDelayMilliseconds: "1500"
          },
          targets: {
            Functions: "ApiLambda"
          }
        }
      },
      tags: {
        Project: "SeismicSentry",
        Purpose: "Hackathon resilience demo"
      }
    });

    const fisExperimentTemplateArn = cdk.Stack.of(this).formatArn({
      service: "fis",
      resource: "experiment-template",
      resourceName: "*"
    });
    const fisExperimentArn = cdk.Stack.of(this).formatArn({
      service: "fis",
      resource: "experiment",
      resourceName: "*"
    });

    apiRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["fis:StartExperiment"],
        resources: [fisExperimentTemplateArn, fisExperimentArn]
      })
    );
    apiRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["fis:GetExperiment", "fis:StopExperiment"],
        resources: [fisExperimentArn]
      })
    );

    const fisEnvironment = {
      ...commonEnvironment,
      FIS_EXPERIMENT_TEMPLATE_ID: fisExperimentTemplate.attrId
    };

    const fisExperiment = new nodejs.NodejsFunction(this, "FisExperimentFunction", {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: "handler",
      entry: path.join(repoRoot, "services/api/src/fis.ts"),
      role: apiRole,
      timeout: Duration.seconds(15),
      memorySize: 512,
      bundling: {
        sourceMap: true,
        target: "node20"
      },
      environment: fisEnvironment
    });

    const httpApi = new apigatewayv2.HttpApi(this, "HttpApi", {
      corsPreflight: {
        allowMethods: [
          apigatewayv2.CorsHttpMethod.GET,
          apigatewayv2.CorsHttpMethod.POST,
          apigatewayv2.CorsHttpMethod.OPTIONS
        ],
        allowHeaders: ["content-type", "authorization", "x-demo-admin-token"],
        allowOrigins: [allowedCorsOrigin]
      }
    });

    httpApi.addRoutes({
      path: "/health",
      methods: [apigatewayv2.HttpMethod.GET],
      integration: new integrations.HttpLambdaIntegration("HealthIntegration", health)
    });

    httpApi.addRoutes({
      path: "/scenarios",
      methods: [apigatewayv2.HttpMethod.GET],
      integration: new integrations.HttpLambdaIntegration("ScenariosIntegration", catalog)
    });

    httpApi.addRoutes({
      path: "/sites",
      methods: [apigatewayv2.HttpMethod.GET],
      integration: new integrations.HttpLambdaIntegration("SitesIntegration", catalog)
    });

    httpApi.addRoutes({
      path: "/scenarios/{scenarioId}/run",
      methods: [apigatewayv2.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration("RunScenarioIntegration", orchestrator)
    });

    httpApi.addRoutes({
      path: "/reports/resilience",
      methods: [apigatewayv2.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration("ReportIntegration", report)
    });

    httpApi.addRoutes({
      path: "/fis/experiments",
      methods: [apigatewayv2.HttpMethod.POST],
      integration: new integrations.HttpLambdaIntegration("FisExperimentIntegration", fisExperiment)
    });

    httpApi.addRoutes({
      path: "/fis/experiments/{experimentId}",
      methods: [apigatewayv2.HttpMethod.GET],
      integration: new integrations.HttpLambdaIntegration("FisExperimentStatusIntegration", fisExperiment)
    });

    const graphqlApi = new appsync.GraphqlApi(this, "RealtimeApi", {
      name: `seismic-sentry-${props.environmentName}`,
      definition: appsync.Definition.fromFile("schema/schema.graphql"),
      authorizationConfig: {
        defaultAuthorization: {
          authorizationType: appsync.AuthorizationType.API_KEY,
          apiKeyConfig: {
            expires: cdk.Expiration.after(Duration.days(30))
          }
        }
      },
      xrayEnabled: true
    });

    const noneDataSource = graphqlApi.addNoneDataSource("RealtimeNoneDataSource");
    noneDataSource.createResolver("PublishScenarioRunResolver", {
      typeName: "Mutation",
      fieldName: "publishScenarioRun",
      requestMappingTemplate: appsync.MappingTemplate.fromString("{\"version\":\"2018-05-29\",\"payload\":$util.toJson($context.arguments.input)}"),
      responseMappingTemplate: appsync.MappingTemplate.fromString("$util.toJson($context.result)")
    });
    apiRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["iam:CreateServiceLinkedRole"],
        resources: ["*"],
        conditions: {
          StringLike: {
            "iam:AWSServiceName": "fis.amazonaws.com"
          }
        }
      })
    );

    new cloudwatch.Dashboard(this, "OpsDashboard", {
      dashboardName: `SeismicSentry-${props.environmentName}`,
      widgets: [
        [
          new cloudwatch.GraphWidget({
            title: "API latency",
            left: [orchestrator.metricDuration()],
            width: 12
          }),
          new cloudwatch.GraphWidget({
            title: "Lambda errors",
            left: [health.metricErrors(), catalog.metricErrors(), orchestrator.metricErrors(), report.metricErrors()],
            width: 12
          })
        ]
      ]
    });

    if (enableSageMaker) {
      this.createOptionalSageMakerEndpoint(id);
    }

    new cdk.CfnOutput(this, "DashboardBucketName", { value: siteBucket.bucketName });
    new cdk.CfnOutput(this, "CloudFrontUrl", { value: `https://${distribution.distributionDomainName}` });
    new cdk.CfnOutput(this, "HttpApiUrl", { value: httpApi.apiEndpoint });
    new cdk.CfnOutput(this, "GraphqlUrl", { value: graphqlApi.graphqlUrl });
    new cdk.CfnOutput(this, "EmergencyAlertTopicArn", { value: alertTopic.topicArn });
    new cdk.CfnOutput(this, "FisRoleArn", { value: fisRole.roleArn });
  }

  private createOptionalSageMakerEndpoint(id: string) {
    const modelArtifactBucket = this.node.tryGetContext("modelArtifactBucket");
    const modelArtifactKey = this.node.tryGetContext("modelArtifactKey");
    const containerImage =
      this.node.tryGetContext("sagemakerContainerImage") ??
      "246618743249.dkr.ecr.us-west-2.amazonaws.com/sagemaker-scikit-learn:1.2-1-cpu-py3";
    const endpointInstanceType = this.node.tryGetContext("sagemakerInstanceType") ?? "ml.t2.medium";

    if (!modelArtifactBucket || !modelArtifactKey) {
      throw new Error("enableSageMaker=true requires modelArtifactBucket and modelArtifactKey context values.");
    }

    const role = new iam.Role(this, "SageMakerExecutionRole", {
      assumedBy: new iam.ServicePrincipal("sagemaker.amazonaws.com")
    });
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ["s3:GetObject"],
        resources: [`arn:aws:s3:::${modelArtifactBucket}/${modelArtifactKey}`]
      })
    );
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ["s3:ListBucket"],
        resources: [`arn:aws:s3:::${modelArtifactBucket}`],
        conditions: {
          StringLike: {
            "s3:prefix": [modelArtifactKey, modelArtifactKey.replace(/\/[^/]+$/, "/*")]
          }
        }
      })
    );

    const model = new sagemaker.CfnModel(this, "FailureModel", {
      executionRoleArn: role.roleArn,
      primaryContainer: {
        image: containerImage,
        modelDataUrl: `s3://${modelArtifactBucket}/${modelArtifactKey}`,
        environment: {
          SAGEMAKER_PROGRAM: "inference.py",
          SAGEMAKER_SUBMIT_DIRECTORY: "/opt/ml/model/code",
          SAGEMAKER_CONTAINER_LOG_LEVEL: "20",
          SAGEMAKER_REGION: this.region
        }
      }
    });

    const endpointConfig = new sagemaker.CfnEndpointConfig(this, "FailureEndpointConfig", {
      productionVariants: [
        {
          initialInstanceCount: 1,
          initialVariantWeight: 1,
          instanceType: endpointInstanceType,
          modelName: model.attrModelName,
          variantName: "primary"
        }
      ]
    });

    new sagemaker.CfnEndpoint(this, "FailureEndpoint", {
      endpointName: `${id.toLowerCase()}-endpoint`,
      endpointConfigName: endpointConfig.attrEndpointConfigName
    });
  }
}
