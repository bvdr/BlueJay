// Agentic Execution Tool for Jarvis CLI
const inquirer = require('inquirer');
const chalk = require('chalk');
const ora = require('ora');
const { exec } = require('child_process');

// Default certainty threshold
const DEFAULT_CERTAINTY_THRESHOLD = 0.7;

/**
 * Orchestrator: Plans tasks and assesses the certainty level of each step
 * @param {Object} openai - OpenAI client
 * @param {string} userInput - User's input/request
 * @param {number} certaintyThreshold - Threshold for certainty (0-1)
 * @returns {Promise<Object>} - Plan with steps and certainty levels
 */
async function createPlan(openai, userInput, certaintyThreshold = DEFAULT_CERTAINTY_THRESHOLD) {
  const spinner = ora('Creating a plan for your request...').start();

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are an intelligent agent that creates execution plans for user requests. 
          Create a CONCISE and EFFICIENT plan with AS FEW STEPS AS POSSIBLE to accomplish the user's request.
          Group related commands together into single steps whenever possible.
          Focus on accuracy and efficiency rather than breaking tasks into many small steps.

          For each step, include:
          1. A clear description of the action
          2. A certainty level (0.0-1.0) indicating how confident you are that this step is correct and necessary
          3. Any commands that need to be executed (if applicable)

          Format your response as a JSON object with a 'steps' array, where each step has:
          - description: string
          - certainty: number (0.0-1.0)
          - command: string (optional, only if a command needs to be executed)

          Example:
          {
            "steps": [
              {
                "description": "Create a file with content in the user's home directory",
                "certainty": 0.95,
                "command": "cd ~ && touch example.txt && echo 'This is an example' > example.txt"
              },
              {
                "description": "Verify the file was created with the correct content",
                "certainty": 0.9,
                "command": "cat ~/example.txt"
              }
            ]
          }`
        },
        {
          role: 'user',
          content: userInput
        }
      ],
      temperature: 0.2,
      response_format: { type: "json_object" }
    });

    const content = response.choices[0].message.content;
    let plan = JSON.parse(content);

    // Ensure the plan has a steps property that is an array
    if (!plan.steps && Array.isArray(plan)) {
      plan = { steps: plan };
    } else if (!plan.steps) {
      plan = { steps: [plan] };
    }

    spinner.succeed('Plan created successfully');
    return plan;
  } catch (error) {
    spinner.fail('Failed to create plan');
    throw error;
  }
}

/**
 * Executor: Performs tasks if certainty is adequate; requests clarification otherwise
 * @param {Object} openai - OpenAI client
 * @param {Object} step - Step to execute
 * @param {number} certaintyThreshold - Threshold for certainty (0-1)
 * @param {Array} previousResults - Results from previous steps
 * @returns {Promise<Object>} - Result of execution
 */
async function executeStep(openai, step, certaintyThreshold = DEFAULT_CERTAINTY_THRESHOLD, previousResults = []) {
  console.log(chalk.cyan(`\nStep: ${step.description}`));

  // If there are previous results, log them as context
  if (previousResults.length > 0) {
    console.log(chalk.blue('Using context from previous steps'));
  }

  // If certainty is below threshold, ask for clarification
  if (step.certainty < certaintyThreshold) {
    return await askForClarification(openai, step, previousResults);
  }

  // If step has a command, execute it
  if (step.command) {
    // If there are previous results, modify the command to include context if needed
    let command = step.command;
    if (previousResults.length > 0) {
      // Check if the command can be enhanced with previous results
      const enhancedCommand = await enhanceCommandWithContext(openai, command, previousResults);
      if (enhancedCommand !== command) {
        console.log(chalk.blue('Command enhanced with context from previous steps'));
        command = enhancedCommand;
      }
    }

    console.log(chalk.yellow(`Command to execute: ${command}`));

    const { confirm } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirm',
        message: 'Do you want to execute this command?',
        default: false
      }
    ]);

    if (confirm) {
      const spinner = ora('Executing command...').start();
      try {
        const result = await executeCommandPromise(command);
        spinner.succeed('Command executed successfully');
        console.log(result);
        return { success: true, result, command };
      } catch (error) {
        spinner.fail('Command execution failed');
        console.error(chalk.red('Error:'), error.message);
        return { success: false, error: error.message, command };
      }
    } else {
      console.log(chalk.yellow('Command execution skipped'));
      return { success: false, skipped: true, command };
    }
  }

  // If step doesn't have a command, just mark it as completed
  console.log(chalk.green('Step completed'));
  return { success: true };
}

/**
 * Helper function to execute a command as a Promise
 * @param {string} command - Command to execute
 * @returns {Promise<string>} - Command output
 */
function executeCommandPromise(command) {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        reject(error);
        return;
      }
      if (stderr) {
        console.warn(chalk.yellow('Command produced stderr:'), stderr);
      }
      resolve(stdout);
    });
  });
}

/**
 * Enhance a command with context from previous steps
 * @param {Object} openai - OpenAI client
 * @param {string} command - Original command
 * @param {Array} previousResults - Results from previous steps
 * @returns {Promise<string>} - Enhanced command
 */
async function enhanceCommandWithContext(openai, command, previousResults) {
  const spinner = ora('Enhancing command with context...').start();

  try {
    // Create a context string from previous results
    const contextString = previousResults.map((result, index) => {
      return `Step ${index + 1} Result: ${result.result || 'No output'}\nCommand: ${result.command || 'No command'}`;
    }).join('\n\n');

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are an intelligent agent that enhances commands with context from previous steps.
          Given the original command and the results from previous steps, determine if the command
          can be enhanced or modified to better use the context from previous steps.

          If the command can be enhanced, return the enhanced command.
          If the command cannot be enhanced, return the original command unchanged.

          Only return the command text, nothing else.`
        },
        {
          role: 'user',
          content: `Original command: ${command}

          Context from previous steps:
          ${contextString}`
        }
      ],
      temperature: 0.2,
    });

    const enhancedCommand = response.choices[0].message.content.trim();
    spinner.succeed('Command enhancement completed');

    return enhancedCommand;
  } catch (error) {
    spinner.fail('Failed to enhance command');
    console.error(chalk.red('Error:'), error.message);
    return command; // Return original command if enhancement fails
  }
}

/**
 * Ask for clarification when certainty is below threshold
 * @param {Object} openai - OpenAI client
 * @param {Object} step - Step that needs clarification
 * @param {Array} previousResults - Results from previous steps
 * @returns {Promise<Object>} - Updated step with clarification
 */
async function askForClarification(openai, step, previousResults = []) {
  console.log(chalk.yellow(`Need more information for this step. Asking for clarification.`));

  // Generate a clarification question
  const spinner = ora('Generating clarification question...').start();
  try {
    // Create a context string from previous results
    const contextString = previousResults.length > 0
      ? previousResults.map((result, index) => {
          return `Step ${index + 1} Result: ${result.result || 'No output'}\nCommand: ${result.command || 'No command'}`;
        }).join('\n\n')
      : 'No previous steps executed yet.';

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are an intelligent agent that needs clarification on a task.
          Based on the following step description and context from previous steps,
          generate a specific question to ask the user that would help increase your certainty about how to proceed.

          Step: ${step.description}
          Current certainty: ${step.certainty}

          Context from previous steps:
          ${contextString}

          Your question should be focused on the most uncertain aspect of the step.`
        }
      ],
      temperature: 0.3,
    });

    const question = response.choices[0].message.content;
    spinner.succeed('Clarification question generated');

    // Ask the user the clarification question
    const { clarification } = await inquirer.prompt([
      {
        type: 'input',
        name: 'clarification',
        message: question,
        validate: input => input.trim() !== '' ? true : 'Please provide some clarification'
      }
    ]);

    // Update the step with the clarification
    spinner.start('Updating plan with clarification...');
    const updatedResponse = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are an intelligent agent that updates execution steps based on user clarification.
          Update the following step with the user's clarification and context from previous steps.

          Original step:
          ${JSON.stringify(step)}

          User clarification:
          ${clarification}

          Context from previous steps:
          ${contextString}

          Return an updated JSON object for the step with:
          - An updated description if needed
          - An updated certainty level (should be higher now that you have clarification)
          - An updated command if applicable`
        }
      ],
      temperature: 0.2,
      response_format: { type: "json_object" }
    });

    const updatedStep = JSON.parse(updatedResponse.choices[0].message.content);
    spinner.succeed('Step updated with clarification');

    console.log(chalk.green('Updated step:'), updatedStep.description);

    // Recursively try to execute the updated step
    return await executeStep(openai, updatedStep, DEFAULT_CERTAINTY_THRESHOLD, previousResults);
  } catch (error) {
    spinner.fail('Failed to get clarification');
    throw error;
  }
}

/**
 * Selector/Verifier: Validates task outcomes and confirms whether expectations align
 * @param {Object} openai - OpenAI client
 * @param {Object} step - Step that was executed
 * @param {Object} result - Result of execution
 * @param {Array} previousResults - Results from previous steps
 * @returns {Promise<Object>} - Verification result
 */
async function verifyStepResult(openai, step, result, previousResults = []) {
  // If step was skipped or failed, no need to verify
  if (!result.success) {
    return { verified: false, reason: result.skipped ? 'Step was skipped' : 'Step execution failed' };
  }

  const spinner = ora('Verifying step result...').start();
  try {
    // Create a context string from previous results
    const contextString = previousResults.length > 0
      ? previousResults.map((result, index) => {
          return `Step ${index + 1} Result: ${result.result || 'No output'}\nCommand: ${result.command || 'No command'}`;
        }).join('\n\n')
      : 'No previous steps executed yet.';

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are an intelligent agent that verifies the results of executed steps.
          Verify if the result of the executed step meets the expectations.

          Step: ${step.description}
          Result: ${result.result || 'Step completed without specific output'}

          Context from previous steps:
          ${contextString}

          Return a JSON object with:
          - verified: boolean (true if the result meets expectations, false otherwise)
          - reason: string (explanation of verification result)
          - suggestion: string (optional, suggestion for next steps if verification failed)`
        }
      ],
      temperature: 0.2,
      response_format: { type: "json_object" }
    });

    const verification = JSON.parse(response.choices[0].message.content);
    spinner.succeed('Verification completed');

    if (verification.verified) {
      console.log(chalk.green('Step verified successfully:'), verification.reason);
    } else {
      console.log(chalk.yellow('Step verification failed:'), verification.reason);
      if (verification.suggestion) {
        console.log(chalk.blue('Suggestion:'), verification.suggestion);
      }
    }

    return verification;
  } catch (error) {
    spinner.fail('Failed to verify step result');
    throw error;
  }
}

/**
 * Main function to run the agentic execution tool
 * @param {Object} openai - OpenAI client
 * @param {string} userInput - User's input/request
 * @returns {Promise<Object>} - Result of execution
 */
async function runAgenticTool(openai, userInput) {
  try {
    console.log(chalk.green('Starting agentic execution for:'), chalk.cyan(userInput));

    // Use default certainty threshold
    const certaintyThreshold = DEFAULT_CERTAINTY_THRESHOLD;

    // Create plan
    const plan = await createPlan(openai, userInput, certaintyThreshold);

    // Display plan
    console.log(chalk.green('\nExecution Plan:'));
    plan.steps.forEach((step, index) => {
      console.log(chalk.cyan(`${index + 1}. ${step.description}`));
      if (step.command) {
        console.log(chalk.yellow(`   Command: ${step.command}`));
      }
    });

    // Confirm plan execution
    const { confirmPlan } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'confirmPlan',
        message: 'Do you want to execute this plan?',
        default: false
      }
    ]);

    if (!confirmPlan) {
      console.log(chalk.yellow('Plan execution cancelled'));
      return { success: false, reason: 'Plan execution cancelled by user' };
    }

    // Execute plan step by step
    const results = [];
    for (let i = 0; i < plan.steps.length; i++) {
      const step = plan.steps[i];
      console.log(chalk.green(`\nExecuting step ${i + 1}/${plan.steps.length}:`));

      // Get previous results to use as context
      const previousResults = results.map(r => r.result).filter(r => r !== undefined);

      // Execute step with context from previous steps
      const result = await executeStep(openai, step, certaintyThreshold, previousResults);

      // Verify step result
      const verification = await verifyStepResult(openai, step, result, previousResults);

      results.push({
        step,
        result,
        verification
      });

      // If verification failed, ask if user wants to continue
      if (!verification.verified) {
        const { continueExecution } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'continueExecution',
            message: 'Step verification failed. Do you want to continue with the next step?',
            default: false
          }
        ]);

        if (!continueExecution) {
          console.log(chalk.yellow('Plan execution stopped after step', i + 1));
          break;
        }
      }
    }

    // Summarize execution
    console.log(chalk.green('\nExecution Summary:'));
    results.forEach((result, index) => {
      const status = result.verification.verified ?
        chalk.green('✓ Success') :
        (result.result.skipped ? chalk.yellow('⚠ Skipped') : chalk.red('✗ Failed'));

      console.log(`${status} Step ${index + 1}: ${result.step.description}`);
    });

    return { success: true, results };
  } catch (error) {
    console.error(chalk.red('Error running agentic execution:'), error.message);
    return { success: false, error: error.message };
  }
}

module.exports = {
  runAgenticTool
};
