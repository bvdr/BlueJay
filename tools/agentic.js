// Agentic Execution Tool for Jarvis CLI
const inquirer = require('inquirer');
const chalk = require('chalk');
const ora = require('ora');
const { exec } = require('child_process');

// Default certainty threshold
const DEFAULT_CERTAINTY_THRESHOLD = 0.7;

// Common placeholder patterns that indicate invented or generic paths/values
const PLACEHOLDER_PATTERNS = [
  /path\/to\//i,
  /example\.com/i,
  /username/i,
  /password/i,
  /your_/i,
  /<[a-z_]+>/i,  // matches <repository_name>, <username>, etc.
  /\[.*?\]/i,    // matches [repository_name], [username], etc.
  /placeholder/i,
  /example/i,
  /sample/i,
  /foo|bar|baz/i,
  /\/path\//i,
  /\/directory\//i,
  /\/folder\//i,
  /\/repo\//i,
  /\/repository\//i
];

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

          IMPORTANT: ALWAYS CHAIN COMMANDS using && or other methods to reduce the number of steps.
          Specifically, NEVER use 'cd' as a standalone command - ALWAYS chain it with subsequent commands.
          For example, instead of:
            Step 1: "cd /path/to/directory"
            Step 2: "git status"
          Use:
            Step 1: "cd /path/to/directory && git status"

          IMPORTANT: Prioritize verification steps before execution steps. For example:
          1. First include steps to verify prerequisites and check if tools/commands are available
          2. Then include steps to verify the environment and gather necessary information
          3. Only after verification steps, include steps that execute actions or make changes

          For each step, include:
          1. A clear description of the action
          2. A certainty level (0.0-1.0) indicating how confident you are that this step is correct and necessary
          3. Any commands that need to be executed (if applicable)

          IMPORTANT GUIDELINES FOR CERTAINTY LEVELS:
          - If you need to use placeholder values like "path/to/repo", "example.com", or "username" in a command, 
            assign a LOW certainty level (below 0.7) to indicate that more information is needed.
          - DO NOT invent specific paths, URLs, or details that you're not certain about.
          - If you're unsure about specific details needed for a command, explicitly use generic placeholders 
            and set a low certainty level so the system will ask for clarification.
          - Only use high certainty levels (0.8-1.0) when you're confident that all details in the command are correct 
            and don't contain placeholder values.

          Format your response as a JSON object with a 'steps' array, where each step has:
          - description: string
          - certainty: number (0.0-1.0)
          - command: string (optional, only if a command needs to be executed)

          Example:
          {
            "steps": [
              {
                "description": "Verify that the required tools are installed",
                "certainty": 0.95,
                "command": "which git && which cat"
              },
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
    // We don't have a partial result for the current step yet, so pass null
    return await askForClarification(openai, step, previousResults, null);
  }

  // If step has a command, execute it
  if (step.command) {
    // Command enhancement has been removed as per requirements
    let command = step.command;

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

// Command enhancement functionality has been removed as per requirements

/**
 * Ask for clarification when certainty is below threshold
 * @param {Object} openai - OpenAI client
 * @param {Object} step - Step that needs clarification
 * @param {Array} previousResults - Results from previous steps
 * @param {Object} currentStepPartialResult - Partial result of the current step, if any
 * @returns {Promise<Object>} - Updated step with clarification
 */
async function askForClarification(openai, step, previousResults = [], currentStepPartialResult = null) {
  console.log(chalk.yellow(`Need more information for this step. Asking for clarification.`));

  // Generate a clarification question
  const spinner = ora('Generating clarification question...').start();
  try {
    // Create a context string from previous results and current step partial result
    let contextString = previousResults.length > 0
      ? previousResults.map((result, index) => {
          return `Step ${index + 1} Result: ${result.result || 'No output'}\nCommand: ${result.command || 'No command'}`;
        }).join('\n\n')
      : 'No previous steps executed yet.';

    // Add current step partial result to context if available
    if (currentStepPartialResult) {
      contextString += `\n\nCurrent Step Partial Result: ${currentStepPartialResult.result || 'No output'}\nCommand: ${currentStepPartialResult.command || 'No command'}`;
    }

    // Check if placeholders were detected
    let placeholderInfo = '';
    if (step.placeholders && step.placeholders.length > 0) {
      placeholderInfo = `
      IMPORTANT: Placeholder values were detected in the command:
      ${step.placeholders.map(p => `- "${p.match}" (matched pattern: ${p.pattern})`).join('\n')}

      Focus your question on getting specific, real values to replace these placeholders.`;
    }

    if (step.descriptionPlaceholders && step.descriptionPlaceholders.length > 0) {
      placeholderInfo += `
      IMPORTANT: Placeholder values were detected in the description:
      ${step.descriptionPlaceholders.map(p => `- "${p.match}" (matched pattern: ${p.pattern})`).join('\n')}

      Focus your question on getting specific, real values to replace these placeholders.`;
    }

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are an intelligent agent that needs clarification on a task.
          Based on the following step description and context from previous steps,
          generate a specific question to ask the user that would help increase your certainty about how to proceed.

          Step: ${step.description}
          Command: ${step.command || 'No command for this step'}
          Current certainty: ${step.certainty}

          Context from previous steps:
          ${contextString}

          ${placeholderInfo}

          Your question should be focused on the most uncertain aspect of the step. 
          If placeholder values were detected, ask specifically about those placeholders.
          For example, if "path/to/repo" was detected, ask "What is the actual path to the repository on your system?"
          Be direct and specific in your questions to get the exact information needed.`
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

          IMPORTANT RULES:
          1. For navigation commands (like 'cd'), if the user has provided a specific path in clarification,
             create a proper 'cd' command with that path, don't append it to other commands.
          2. If the original command is a verification command (like 'which git') and the clarification
             provides information for navigation, completely replace the command with the appropriate one.
          3. Don't combine verification commands with navigation commands.

          Return an updated JSON object for the step with:
          - An updated description if needed
          - An updated certainty level (should be higher now that you have clarification)
          - An updated command if applicable, completely replacing the original if necessary`
        }
      ],
      temperature: 0.2,
      response_format: { type: "json_object" }
    });

    const updatedStep = JSON.parse(updatedResponse.choices[0].message.content);

    // Mark this step as clarified to prevent further command enhancement
    updatedStep.clarified = true;

    spinner.succeed('Step updated with clarification');

    console.log(chalk.green('Updated step:'), updatedStep.description);

    // Recursively try to execute the updated step with updated context
    // If we have a partial result for the current step, include it in the context
    let updatedPreviousResults = [...previousResults];
    if (currentStepPartialResult) {
      updatedPreviousResults.push(currentStepPartialResult);
    }

    return await executeStep(openai, updatedStep, DEFAULT_CERTAINTY_THRESHOLD, updatedPreviousResults);
  } catch (error) {
    spinner.fail('Failed to get clarification');
    throw error;
  }
}

/**
 * Validates and updates the remaining plan steps based on the current step's output
 * @param {Object} openai - OpenAI client
 * @param {Object} currentStep - Current step that was executed
 * @param {Object} result - Result of execution
 * @param {Array} previousResults - Results from previous steps
 * @param {Array} remainingSteps - Remaining steps in the plan
 * @returns {Promise<Object>} - Updated remaining steps and validation result
 */
async function validateRemainingPlan(openai, currentStep, result, previousResults = [], remainingSteps = []) {
  if (remainingSteps.length === 0) {
    return { updatedSteps: [], needsUpdate: false };
  }

  const spinner = ora('Validating remaining plan steps...').start();
  try {
    // Create a context string from previous results
    const contextString = previousResults.length > 0
      ? previousResults.map((result, index) => {
          return `Step ${index + 1} Result: ${result.result || 'No output'}\nCommand: ${result.command || 'No command'}`;
        }).join('\n\n')
      : 'No previous steps executed yet.';

    // Create a string representation of the remaining steps
    const remainingStepsString = remainingSteps.map((step, index) => {
      return `Step ${index + 1}: ${step.description}${step.command ? `\nCommand: ${step.command}` : ''}`;
    }).join('\n\n');

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `You are an intelligent agent that validates and updates execution plans.
          Based on the result of the current step and the context from previous steps,
          determine if the remaining steps in the plan need to be updated.

          Current Step: ${currentStep.description}
          Result: ${result.result || 'Step completed without specific output'}

          Context from previous steps:
          ${contextString}

          Remaining steps in the plan:
          ${remainingStepsString}

          Return a JSON object with:
          - needsUpdate: boolean (true if the remaining steps need to be updated, false otherwise)
          - reason: string (explanation of why the steps need to be updated or not)
          - updatedSteps: array (only if needsUpdate is true, containing the updated steps with the same structure as the original steps)

          Each step in updatedSteps should have:
          - description: string
          - certainty: number (0.0-1.0)
          - command: string (optional, only if a command needs to be executed)`
        }
      ],
      temperature: 0.2,
      response_format: { type: "json_object" }
    });

    const validation = JSON.parse(response.choices[0].message.content);
    spinner.succeed('Plan validation completed');

    if (validation.needsUpdate) {
      console.log(chalk.yellow('Remaining plan steps need to be updated:'), validation.reason);
      return {
        updatedSteps: validation.updatedSteps || [],
        needsUpdate: true,
        reason: validation.reason
      };
    } else {
      console.log(chalk.green('Remaining plan steps are still valid:'), validation.reason);
      return {
        updatedSteps: remainingSteps,
        needsUpdate: false,
        reason: validation.reason
      };
    }
  } catch (error) {
    spinner.fail('Failed to validate remaining plan steps');
    console.error(chalk.red('Error:'), error.message);
    return { updatedSteps: remainingSteps, needsUpdate: false };
  }
}

/**
 * Selector/Verifier: Validates task outcomes and confirms whether expectations align
 * @param {Object} openai - OpenAI client
 * @param {Object} step - Step that was executed
 * @param {Object} result - Result of execution
 * @param {Array} previousResults - Results from previous steps
 * @param {Array} remainingSteps - Remaining steps in the plan
 * @returns {Promise<Object>} - Verification result
 */
async function verifyStepResult(openai, step, result, previousResults = [], remainingSteps = []) {
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

      // If there are remaining steps, validate them
      if (remainingSteps && remainingSteps.length > 0) {
        const planValidation = await validateRemainingPlan(openai, step, result, previousResults, remainingSteps);
        verification.planValidation = planValidation;
      }
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

    // Store the original user input for use in creating new plans after failures
    const originalUserInput = userInput;

    // Use default certainty threshold
    const certaintyThreshold = DEFAULT_CERTAINTY_THRESHOLD;

    // Create plan
    const plan = await createPlan(openai, userInput, certaintyThreshold);

    // Check for placeholders in commands and adjust certainty if needed
    plan.steps.forEach(step => {
      if (step.command) {
        const placeholderCheck = detectPlaceholders(step.command);
        if (placeholderCheck.detected) {
          // If placeholders are detected, reduce certainty to trigger clarification
          const originalCertainty = step.certainty;
          step.certainty = Math.min(step.certainty, certaintyThreshold - 0.1);

          // Add placeholder info to the step for reference
          step.placeholders = placeholderCheck.patterns;

          console.log(chalk.yellow(`Note: Detected potential placeholder values in command: "${step.command}"`));
          console.log(chalk.yellow(`Adjusting certainty from ${originalCertainty.toFixed(2)} to ${step.certainty.toFixed(2)} to request clarification.`));
        }
      }

      // Also check description for placeholders
      const descPlaceholderCheck = detectPlaceholders(step.description);
      if (descPlaceholderCheck.detected) {
        // If placeholders are detected in description, also reduce certainty
        const originalCertainty = step.certainty;
        step.certainty = Math.min(step.certainty, certaintyThreshold - 0.1);

        // Add placeholder info to the step for reference
        step.descriptionPlaceholders = descPlaceholderCheck.patterns;

        console.log(chalk.yellow(`Note: Detected potential placeholder values in description: "${step.description}"`));
        console.log(chalk.yellow(`Adjusting certainty from ${originalCertainty.toFixed(2)} to ${step.certainty.toFixed(2)} to request clarification.`));
      }
    });

    // Display plan
    console.log(chalk.green('\nExecution Plan:'));
    plan.steps.forEach((step, index) => {
      console.log(chalk.cyan(`${index + 1}. ${step.description}`));
      if (step.command) {
        console.log(chalk.yellow(`   Command: ${step.command}`));
      }

      // Display certainty level if it's below threshold (will require clarification)
      if (step.certainty < certaintyThreshold) {
        console.log(chalk.red(`   Certainty: ${step.certainty.toFixed(2)} - Will ask for clarification`));
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

      // Check if this step has already been executed
      const alreadyExecuted = results.find(r =>
        r.step.description === step.description &&
        r.step.command === step.command &&
        r.verification &&
        r.verification.verified
      );

      if (alreadyExecuted) {
        console.log(chalk.green(`Step already executed successfully. Skipping.`));
        // Use the previous result
        const result = alreadyExecuted.result;
        // Skip to verification
        const verification = alreadyExecuted.verification;

        results.push({
          step,
          result,
          verification
        });

        continue; // Skip to the next step
      }

      // Execute step with context from previous steps
      const result = await executeStep(openai, step, certaintyThreshold, previousResults);

      // If step execution failed (not skipped), offer to create a new plan
      if (!result.success && !result.skipped) {
        console.log(chalk.red('\nStep execution failed:'), result.error);

        const { createNewPlan } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'createNewPlan',
            message: 'Would you like to create a new plan from this point?',
            default: true
          }
        ]);

        if (createNewPlan) {
          // Create a new plan based on the failed step
          const newPlan = await createNewPlanAfterFailure(
            openai,
            step,
            result.error,
            results.map(r => r.result).filter(r => r !== undefined),
            originalUserInput
          );

          // Display the new plan
          console.log(chalk.green('\nNew Plan:'));
          newPlan.steps.forEach((newStep, index) => {
            console.log(chalk.cyan(`${index + 1}. ${newStep.description}`));
            if (newStep.command) {
              console.log(chalk.yellow(`   Command: ${newStep.command}`));
            }

            // Display certainty level if it's below threshold (will require clarification)
            if (newStep.certainty < certaintyThreshold) {
              console.log(chalk.red(`   Certainty: ${newStep.certainty.toFixed(2)} - Will ask for clarification`));
            }
          });

          // Ask user if they want to use the new plan
          const { useNewPlan } = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'useNewPlan',
              message: 'Do you want to use this new plan?',
              default: true
            }
          ]);

          if (useNewPlan) {
            // Replace the current plan with the new plan
            plan.steps = newPlan.steps;
            console.log(chalk.green('New plan adopted. Restarting execution from the beginning of the new plan.'));

            // Reset the loop to start from the beginning of the new plan
            i = -1; // Will be incremented to 0 at the end of the loop
            results.length = 0; // Clear previous results
            continue; // Skip the rest of the current iteration
          } else {
            console.log(chalk.yellow('Continuing with the original plan.'));
          }
        }
      }

      // Get remaining steps in the plan
      const remainingSteps = i < plan.steps.length - 1 ? plan.steps.slice(i + 1) : [];

      // Verify step result and validate remaining plan
      const verification = await verifyStepResult(openai, step, result, previousResults, remainingSteps);

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
      // If verification succeeded and plan validation indicates updates are needed
      else if (verification.planValidation && verification.planValidation.needsUpdate) {
        console.log(chalk.yellow('\nRemaining plan steps need to be updated based on the current step output.'));
        console.log(chalk.yellow('Reason:'), verification.planValidation.reason);

        // Display the updated plan
        console.log(chalk.green('\nUpdated Execution Plan:'));
        verification.planValidation.updatedSteps.forEach((updatedStep, index) => {
          console.log(chalk.cyan(`${index + 1}. ${updatedStep.description}`));
          if (updatedStep.command) {
            console.log(chalk.yellow(`   Command: ${updatedStep.command}`));
          }
        });

        // Ask user if they want to use the updated plan
        const { useUpdatedPlan } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'useUpdatedPlan',
            message: 'Do you want to use this updated plan for the remaining steps?',
            default: true
          }
        ]);

        if (useUpdatedPlan) {
          // Replace the remaining steps in the plan with the updated steps
          plan.steps.splice(i + 1, plan.steps.length - (i + 1), ...verification.planValidation.updatedSteps);
          console.log(chalk.green('Plan updated successfully. Continuing with the updated plan.'));
        } else {
          console.log(chalk.yellow('Continuing with the original plan.'));
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

/**
 * Detects placeholder patterns in a command or description
 * @param {string} text - The command or description to check
 * @returns {Object} - Object with detected flag and details
 */
function detectPlaceholders(text) {
  if (!text) return { detected: false };

  const detectedPatterns = [];

  for (const pattern of PLACEHOLDER_PATTERNS) {
    const matches = text.match(pattern);
    if (matches) {
      detectedPatterns.push({
        pattern: pattern.toString(),
        match: matches[0]
      });
    }
  }

  return {
    detected: detectedPatterns.length > 0,
    patterns: detectedPatterns
  };
}

/**
 * Creates a new plan after a step fails
 * @param {Object} openai - OpenAI client
 * @param {Object} failedStep - Step that failed
 * @param {string} errorMessage - Error message from the failed step
 * @param {Array} previousResults - Results from previous steps
 * @param {string} originalUserInput - Original user input that created the plan
 * @returns {Promise<Object>} - New plan with steps
 */
async function createNewPlanAfterFailure(openai, failedStep, errorMessage, previousResults = [], originalUserInput = '') {
  const spinner = ora('Creating a new plan after failure...').start();

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
          content: `You are an intelligent agent that creates new execution plans after a step has failed.
          Based on the failed step, error message, and context from previous steps, create a new plan to accomplish the original goal.

          IMPORTANT: The new plan should:
          1. Start with verification steps to check if the tools/commands needed are available
          2. Include alternative approaches to achieve the same goal
          3. Be more cautious and include more verification steps
          4. Avoid using the same approach that failed

          For each step, include:
          1. A clear description of the action
          2. A certainty level (0.0-1.0) indicating how confident you are that this step is correct and necessary
          3. Any commands that need to be executed (if applicable)

          IMPORTANT GUIDELINES FOR CERTAINTY LEVELS:
          - If you need to use placeholder values like "path/to/repo", "example.com", or "username" in a command, 
            assign a LOW certainty level (below 0.7) to indicate that more information is needed.
          - DO NOT invent specific paths, URLs, or details that you're not certain about.
          - If you're unsure about specific details needed for a command, explicitly use generic placeholders 
            and set a low certainty level so the system will ask for clarification.
          - Only use high certainty levels (0.8-1.0) when you're confident that all details in the command are correct 
            and don't contain placeholder values.

          Format your response as a JSON object with a 'steps' array, where each step has:
          - description: string
          - certainty: number (0.0-1.0)
          - command: string (optional, only if a command needs to be executed)`
        },
        {
          role: 'user',
          content: `Original request: ${originalUserInput}

          Failed step: ${failedStep.description}
          Failed command: ${failedStep.command || 'No command'}
          Error message: ${errorMessage}

          Context from previous steps:
          ${contextString}

          Please create a new plan to accomplish the original goal, taking into account the failure and previous steps.`
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

    spinner.succeed('New plan created successfully');
    return plan;
  } catch (error) {
    spinner.fail('Failed to create new plan');
    throw error;
  }
}

module.exports = {
  runAgenticTool,
  createPlan,  // Export for testing and for use by other modules
  validateRemainingPlan,  // Export for testing and for use by other modules
  createNewPlanAfterFailure  // Export for testing and for use by other modules
};
