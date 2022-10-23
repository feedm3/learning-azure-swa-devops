/**
 * This scripts posts the link to a preview environment to the connected pull requests.
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

/**
 * Predefined Variables: https://learn.microsoft.com/en-us/azure/devops/pipelines/build/variables?view=azure-devops&tabs=yaml
 */
const REPO_ID = process.env['BUILD_REPOSITORY_ID'] as string;
const PR_BRANCH_NAME = process.env['BUILD_SOURCEBRANCHNAME'] as string;
const PR_FULL_BRANCH_NAME = process.env['BUILD_SOURCEBRANCH'] as string;

// only set when the pipeline is triggered via "Build Validation"
const PR_ID = Number.parseInt(process.env['SYSTEM_PULLREQUEST_PULLREQUESTID'] as string);

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
  console.log(`Posting comment to ${{REPO_ID, PR_ID, PR_BRANCH_NAME}}...`)

  const webAppDeployments = await getAllStaticWebAppDeployments();
  const deployment = webAppDeployments.find(deplyoment => deplyoment.sourceBranch === PR_BRANCH_NAME);

  // post comment
  const authHandler = getPersonalAccessTokenHandler(DEVOPS_PAT);
  const connection = new WebApi(DEVOPS_ORG_URL, authHandler);

  await connection.connect();

  const gitApi = await connection.getGitApi(`${DEVOPS_ORG_URL}/${DEVOPS_PROJECT}`);

  const pullRequests = await gitApi.getPullRequests(REPO_ID, {});
  const linkedPullRequest = pullRequests.find(pullRequest => pullRequest.sourceRefName === PR_FULL_BRANCH_NAME);

  if (!linkedPullRequest) {
    console.error('Could not find pull request to post the link to!');
    return;
  }

  await gitApi.createThread({
    status: 2, // 2 = CommentThreadStatus.Fixed
    comments: [
      {
        parentCommentId: 0,
        content: `🚀 Your Pull Request changes are deployed to: ${deployment!.hostname}`,
        commentType: 1, // 1 = CommentType.Text
      }
    ]
  }, REPO_ID, linkedPullRequest.pullRequestId!);

  console.log('Comment posted!')
}

await run();
