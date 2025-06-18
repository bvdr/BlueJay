// GitHub Tool for Jarvis CLI
const inquirer = require('inquirer');
const chalk = require('chalk');
const ora = require('ora');
const { Octokit } = require('@octokit/rest');

// Initialize GitHub client
async function initGitHub(token) {
  if (!token) {
    throw new Error('GitHub token is required');
  }
  return new Octokit({ auth: token });
}

// Get list of organizations for the authenticated user
async function getOrganizations(octokit) {
  const spinner = ora('Fetching organizations...').start();
  try {
    // Get user's organizations
    const { data: orgs } = await octokit.orgs.listForAuthenticatedUser();

    // Also get the user's info to include personal account
    const { data: user } = await octokit.users.getAuthenticated();

    spinner.succeed('Organizations fetched successfully');

    // Combine personal account with organizations
    return [
      { name: user.login, id: user.id, type: 'personal' },
      ...orgs.map(org => ({ name: org.login, id: org.id, type: 'organization' }))
    ];
  } catch (error) {
    spinner.fail('Failed to fetch organizations');
    throw error;
  }
}

// Get repositories for an organization or user
async function getRepositories(octokit, owner, type) {
  const spinner = ora(`Fetching repositories for ${owner}...`).start();
  try {
    let repos;

    if (type === 'personal') {
      // Get user's repositories
      const { data } = await octokit.repos.listForAuthenticatedUser({
        username: owner,
        sort: 'updated',
        direction: 'desc'
      });
      // Filter to only include repositories owned by the user
      repos = data.filter(repo => repo.owner.login === owner);
    } else {
      // Get organization repositories
      const { data } = await octokit.repos.listForOrg({
        org: owner,
        sort: 'updated',
        direction: 'desc'
      });
      repos = data;
    }

    spinner.succeed('Repositories fetched successfully');
    return repos.map(repo => ({
      name: repo.name,
      full_name: repo.full_name,
      description: repo.description || 'No description',
      updated_at: new Date(repo.updated_at).toLocaleDateString()
    }));
  } catch (error) {
    spinner.fail(`Failed to fetch repositories for ${owner}`);
    throw error;
  }
}

// Get pull requests for a repository
async function getPullRequests(octokit, owner, repo) {
  const spinner = ora(`Fetching pull requests for ${owner}/${repo}...`).start();
  try {
    const { data } = await octokit.pulls.list({
      owner,
      repo,
      state: 'open',
      sort: 'updated',
      direction: 'desc'
    });

    spinner.succeed('Pull requests fetched successfully');
    return data.map(pr => ({
      number: pr.number,
      title: pr.title,
      user: pr.user.login,
      created_at: new Date(pr.created_at).toLocaleDateString(),
      updated_at: new Date(pr.updated_at).toLocaleDateString(),
      url: pr.html_url
    }));
  } catch (error) {
    spinner.fail(`Failed to fetch pull requests for ${owner}/${repo}`);
    throw error;
  }
}

// Interactive CLI menu for GitHub tool
async function runGitHubTool(token) {
  try {
    // Initialize GitHub client
    const octokit = await initGitHub(token);

    // Get organizations
    const organizations = await getOrganizations(octokit);

    // Prompt user to select an organization
    const { selectedOrg } = await inquirer.prompt([
      {
        type: 'list',
        name: 'selectedOrg',
        message: 'Select an organization or your personal account:',
        choices: organizations.map((org, index) => ({
          name: `${index + 1}. ${org.name} (${org.type})`,
          value: org
        }))
      }
    ]);

    // Get repositories for the selected organization
    const repositories = await getRepositories(octokit, selectedOrg.name, selectedOrg.type);

    // Prompt user to search and select a repository
    const { searchTerm } = await inquirer.prompt([
      {
        type: 'input',
        name: 'searchTerm',
        message: 'Search repositories (leave empty to show all):',
      }
    ]);

    // Filter repositories based on search term
    const filteredRepos = searchTerm
      ? repositories.filter(repo =>
          repo.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
          (repo.description && repo.description.toLowerCase().includes(searchTerm.toLowerCase()))
        )
      : repositories;

    if (filteredRepos.length === 0) {
      console.log(chalk.yellow('No repositories found matching your search.'));
      return;
    }

    // Prompt user to select a repository
    const { selectedRepo } = await inquirer.prompt([
      {
        type: 'list',
        name: 'selectedRepo',
        message: 'Select a repository:',
        choices: filteredRepos.map(repo => ({
          name: `${repo.name} - ${repo.description} (Updated: ${repo.updated_at})`,
          value: repo
        }))
      }
    ]);

    // Get pull requests for the selected repository
    const [owner, repo] = selectedRepo.full_name.split('/');
    const pullRequests = await getPullRequests(octokit, owner, repo);

    if (pullRequests.length === 0) {
      console.log(chalk.yellow('No open pull requests found for this repository.'));
      return;
    }

    // Display pull requests
    console.log(chalk.green(`\nOpen Pull Requests for ${selectedRepo.full_name}:`));
    pullRequests.forEach(pr => {
      console.log(chalk.cyan(`\n#${pr.number}: ${pr.title}`));
      console.log(`Author: ${pr.user}`);
      console.log(`Created: ${pr.created_at}, Updated: ${pr.updated_at}`);
      console.log(`URL: ${pr.url}`);
    });

  } catch (error) {
    console.error(chalk.red('Error:'), error.message);
  }
}

module.exports = {
  runGitHubTool
};
