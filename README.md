# Learning Azure

This repo is used to show how Azure Static Webapps can work together with Azure Devops to create a "Netlify" like 
experience. 

- Every pull request should create a build the app and deploy it to a new, isolated environment
- The link to the environment should be posted as a comment in the pull request
- After merging, the deployment should be removed to save resources and money

> This repo is intended to be used in Azure DevOps, not on GitHub!

## Setup

1. Copy the [.azure](.azure) and [scripts](scripts) folder to your repo
2. Create 2 new pipelines, one for the deployments and one for the cleanup
3. Add 2 environment variables to each pipeline: `DEVOPS_PAT` (your PAT from DevOps) and `AZURE_SUBSCRIPTION` (the
subscription under which your SWA lives).
4. Edit the variables inside the pipeline files to fit your setup.
5. Done

<details>
<summary>Your pipelines in Azure DevOps</summary>
<img src="https://github.com/feedm3/learning-azure-swa-devops/raw/main/docs/azure-devops-pipeliens.png"/>
</details>

<details>
<summary>The variables each pipeline needs</summary>
<img src="https://github.com/feedm3/learning-azure-swa-devops/raw/main/docs/azure-devops-pipeline-variables.png"/>
</details>

<details>
<summary>The deployments you will see per PR</summary>
<img src="https://github.com/feedm3/learning-azure-swa-devops/raw/main/docs/azure-swa-deployments.png"/>
</details>

<details>
<summary>Every deployment URL will be commented in the associated PR</summary>
<img src="https://github.com/feedm3/learning-azure-swa-devops/raw/main/docs/azure-devops-comment.png"/>
</details>

## How it works

2 pipelines are needed:

1. Deployment pipeline: This pipeline builds the app, deploys it to SWA and posts to link to the deployment in the 
pull request.

- Pipeline: [.azure/deploy-preview-environment.yml](.azure/deploy-preview-environment.yml)
- Script: [scripts/pr-post-deployment-url-to-pr.ts](scripts/pr-post-deployment-url-to-pr.ts)

> The app is built inside the pipeline and not in the AzureStaticWebApp@0 task in order to get more control.

2. Cleanup pipeline: This pipeline checks all deployments if they have a linked and open pull request. If not, the
deployment gets removed.

- Pipeline: [.azure/cleanup-preview-environmente.yml](.azure/cleanup-preview-environmente.yml)
- Script: [scripts/pr-cleanup-deployments.ts](scripts/pr-cleanup-deployments.ts)

## Drawbacks

There is no PR trigger in Azure DevOps, only "Build validation". This feature can't be used, as the Azure Deploy Task
doesn't work with it: https://github.com/microsoft/azure-pipelines-tasks/issues/17066

Due to that, the pipelines are all triggered by branch updates. This has some drawbacks, but they shouldn't cause that 
much pain if the developers are aware of it:

- The deployment will be triggered with every commit on every branch. Depending on your workflow, this could mean that 
the deployments run more often than necessary.
- Outdated/Inactive deployments are removed by a job that is triggered only on updates on the `main` branch. The `main`
branch should update often enough that this is not a big pain point.
- There is no status indicator on the PR that tells you an app gets build and deployed. Developers need to know about
the deployment pipeline.
- The deployment pipeline triggers right after the branch is pushed. If you don't have an open PR after the app was
deployed, the pipeline can't post the URL into a PR. You have to create a PR, update the branch, and then wait for the comment.

## Logs

### AZ

Using `az` cli in order to work with it on Azure Devops

```bash
# list deployments
az staticwebapp environment list -n react-app

# show deployment
az staticwebapp environment show -n react-app --environment-name feat-pr-branch-real

# delete deployment
az staticwebapp environment delete --name react-app --environment-name preview

# deploy
swa deploy ./dist --env featbreanchreal --deployment-token {PAT}
```

### Resources

- azure devops nodejs sdk: https://github.com/microsoft/azure-devops-node-api
- azure env variables: https://learn.microsoft.com/en-us/azure/devops/pipelines/build/variables?view=azure-devops&tabs=yaml
- azure pr trigger: https://learn.microsoft.com/en-us/azure/devops/pipelines/repos/azure-repos-git?view=azure-devops&tabs=yaml#pr-triggers

not working:
- outdated: https://github.com/Azure/azure-sdk-for-node
- missing swa: https://github.com/azure/azure-sdk-for-js
- only cli, no `list` and no `delete` command: https://github.com/Azure/static-web-apps-cli
