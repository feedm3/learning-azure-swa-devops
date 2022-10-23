/**
 * This script removes all deployments on Azure Static Web Apps that do not have an open pull request
 */

import { getPersonalAccessTokenHandler, WebApi } from "azure-devops-node-api";
import { exec as callbackExec } from 'child_process';
import { promisify } from 'util';

const exec = promisify(callbackExec);

/**
 * Project config in Azure DevOps and Azure
 */
const DEVOPS_ORG_URL = process.env["DEVOPS_ORG_URL"] as string;
const DEVOPS_PROJECT = process.env["DEVOPS_PROJECT"] as string;
const DEVOPS_PAT = process.env["DEVOPS_PAT"] as string;
const AZURE_SUBSCRIPTION = process.env["AZURE_SUBSCRIPTION"] as string;
const AZURE_STATIC_WEBAPP_NAME = process.env["AZURE_STATIC_WEBAPP_NAME"] as string;

const ALWAYS_DEPLOYED_BRANCHES = ['main'];

/**
 * Predefined Variables: https://learn.microsoft.com/en-us/azure/devops/pipelines/build/variables?view=azure-devops&tabs=yaml
 */
const REPO_ID = process.env['BUILD_REPOSITORY_ID'] as string;

/**
 * Get all deployments from SWA.
 * - https://learn.microsoft.com/de-de/cli/azure/staticwebapp/environment?view=azure-cli-latest#az-staticwebapp-environment-list
 *
 * Example Response:
 * [
 *   {
 *     "buildId": "default",
 *     "createdTimeUtc": "2022-10-13T15:34:28.390745",
 *     "hostname": "white-dune-044a9f703.2.azurestaticapps.net",
 *     "id": "/subscriptions/{SUBSCRIPTION_ID}/resourceGroups/azure-learning/providers/Microsoft.Web/staticSites/react-app/builds/default",
 *     "kind": null,
 *     "lastUpdatedOn": "2022-10-17T20:18:04.530739",
 *     "linkedBackends": [],
 *     "location": "West Europe",
 *     "name": "default",
 *     "pullRequestTitle": null,
 *     "resourceGroup": "azure-learning",
 *     "sourceBranch": "main",
 *     "status": "Ready",
 *     "type": "Microsoft.Web/staticSites/builds",
 *     "userProvidedFunctionApps": null
 *   },
 *   {
 *     buildId: 'featfeature6',
 *     createdTimeUtc: '2022-10-18T20:50:35.276015',
 *     hostname: 'white-dune-044a9f703-featfeature6.westeurope.2.azurestaticapps.net',
 *     id: '/subscriptions/{SUBSCRIPTION_ID}/resourceGroups/azure-learning/providers/Microsoft.Web/staticSites/react-app/builds/featfeature6',
 *     kind: null,
 *     lastUpdatedOn: '2022-10-19T16:01:40.867370',
 *     linkedBackends: [],
 *     location: 'West Europe',
 *     name: 'featfeature6',
 *     pullRequestTitle: null,
 *     resourceGroup: 'azure-learning',
 *     sourceBranch: 'feat-feature-6',
 *     status: 'Ready',
 *     type: 'Microsoft.Web/staticSites/builds',
 *     userProvidedFunctionApps: null
 *   }
 * ]
 */
const getAllStaticWebAppDeployments = async (): Promise<{ name: string; sourceBranch: string, hostname: string }[]> => {
  const { stdout, stderr } = await exec(`az staticwebapp environment list --name ${AZURE_STATIC_WEBAPP_NAME} --subscription ${AZURE_SUBSCRIPTION}`);
  if (stderr) {
    console.error('Command failed!', stderr);
    throw new Error(stderr);
  }

  return JSON.parse(stdout);
}

const run = async () => {
  console.log(`Cleanup outdated deployments ${{REPO_ID, DEVOPS_PROJECT, AZURE_STATIC_WEBAPP_NAME}}...`)

  const webAppDeployments = await getAllStaticWebAppDeployments();

  // post comment
  const authHandler = getPersonalAccessTokenHandler(DEVOPS_PAT);
  const connection = new WebApi(DEVOPS_ORG_URL, authHandler);

  await connection.connect();

  const gitApi = await connection.getGitApi(`${DEVOPS_ORG_URL}/${DEVOPS_PROJECT}`);

  // status 1 is active (PullRequestStatus type)
  const activePullRequests = await gitApi.getPullRequests(REPO_ID, { status: 1 });
  const activePullRequestBranches = activePullRequests.map(pr => pr.sourceRefName).filter(Boolean).map(fullBranchName => fullBranchName!.split('/')[2]);

  // main deployment should always be alive
  activePullRequestBranches.push(...ALWAYS_DEPLOYED_BRANCHES);

  const outdatedDeployments = webAppDeployments.filter(deployment => {
    return !activePullRequestBranches.includes(deployment.sourceBranch);
  })
  console.log('Deployments to delete:', outdatedDeployments);

  for await (const deployment of outdatedDeployments) {
    const deploymentName = deployment.name;
    console.log(`Deleting deployment ${deploymentName}...`);

    /**
     * Deletion works, but ends with an irrelevant error:
     *
     * (AuthorizationFailed) The client '{CLIENT_ID}' with object id '{CLIENT_ID}' does not have authorization to
     * perform action 'Microsoft.Web/locations/operationResults/read' over
     * scope '/subscriptions/{SUBSCRIPTION_ID}/providers/Microsoft.Web/locations/westeurope/operationResults/ae2d380e-95f7-4fdb-b81f-62718411647d'
     * or the scope is invalid. If access was recently granted, please refresh your credentials.
     */
    try {
      const { stderr } = await exec(`az staticwebapp environment delete --name ${AZURE_STATIC_WEBAPP_NAME} --subscription ${AZURE_SUBSCRIPTION}  --environment-name ${deploymentName} --yes`);
      if (stderr) {
        console.error('Could not delete deployment ', deploymentName);
      } else {
        console.log('Deleted deployment ', deploymentName);
      }
    } catch (e) {
      console.log('Deleted deployment ', deploymentName);
    }
  }

  console.log('Outdated deployments cleared!')
}

await run();
