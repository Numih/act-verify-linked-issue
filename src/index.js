 
const core = require('@actions/core')
const github = require('@actions/github');
const context = github.context;
const token = process.env.GITHUB_TOKEN;
const octokit = github.getOctokit(token);
const fs = require('fs')

async function verifyLinkedIssue() {
  let linkedIssue = await checkBodyForValidIssue(context, github);
  if (!linkedIssue) {
    linkedIssue = await checkEventsListForConnectedEvent(context, github);
  }

  if(linkedIssue){
    core.notice("Success! Linked Issue Found!");
  }
  else{
      await createMissingIssueComment(context, github);
      core.error("No Linked Issue Found!");
      core.setFailed("No Linked Issue Found!");
  }
}

async function checkBodyForValidIssue(context, github){
  let body = context.payload.pull_request.body;
  if (!body){
    return false;
  }
  core.debug(`Checking PR Body: "${body}"`)
  const re = /\s(([a-zA-Z\-\._]+)\/([a-zA-Z\-\._]+))?#([0-9]+)/g;
  const matches = body.matchAll(re);
  core.debug(`regex matches: ${matches.length}`)
  if(matches){
    for(let match of matches){
      core.debug(`regex match: ${match}`)
      const owner = match[2] || context.repo.owner
      const repo = match[3] || context.repo.repo
      const issueId = match[4]
      core.debug(`verifying match is a valid issue: ${owner}/${repo}#${issueId}`)
      try{
        let issue = await  octokit.rest.issues.get({
          owner: owner,
          repo: repo,
          issue_number: issueId,
        });
        if(issue){
          core.debug(`Found issue in PR Body ${issueId}`);
        }
      }
      catch{
        core.debug(`${owner}/${repo}#${issueId} is not a valid issue.`);
        return false;
      }
    }
    return true;
  }
  return false;
}

async function checkEventsListForConnectedEvent(context, github){
  const payload = JSON.stringify(github.context.payload, undefined, 2)
  let pull = await octokit.rest.issues.listEvents({
    owner: context.repo.owner,
    repo: context.repo.repo,
    issue_number: context.payload.pull_request.number 
  });

  if(pull.data){
    pull.data.forEach(item => {
      if (item.event == "connected"){
        core.debug(`Found connected event.`);
        return true;
      }
    });
  }
  return false;
}

async function createMissingIssueComment(context,github ) {
  const defaultMessage =  'Build Error! No Linked Issue found. Please link an issue or mention it in the body using #<issue_id>';
  let messageBody = core.getInput('message');
  if(!messageBody){
    let filename = core.getInput('filename');
    if(!filename){
      filename = '.github/VERIFY_PR_COMMENT_TEMPLATE.md';
    }
    messageBody=defaultMessage;
    try{
      const file = fs.readFileSync(filename, 'utf8')
      if(file){
        messageBody = file;
      }
      else{
        messageBody = defaultMessage;
      }
    }
    catch{
      messageBody = defaultMessage;
    }
  }

  core.debug(`Adding comment to PR. Comment text: ${messageBody}`);
  await octokit.rest.issues.createComment({
    issue_number: context.payload.pull_request.number,
    owner: context.repo.owner,
    repo: context.repo.repo,
    body: messageBody
  });
}

async function run() {

  try {
    if(!context.payload.pull_request){
        core.info('Not a pull request skipping verification!');
        return;
    }

    core.debug('Starting Linked Issue Verification!');
    await verifyLinkedIssue();
    
  } catch (err) {
    core.error(`Error verifying linked issue.`)
    core.error(err)

    if (err.errors) core.error(err.errors)
    const errorMessage = "Error verifying linked issue."
    core.setFailed(errorMessage + '\n\n' + err.message)
  }

}

run();
