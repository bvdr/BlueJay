# BlueJay Onboarding Improvements - TODO

## Implementation Checklist

### Task 1: Add Anthropic Claude as AI Provider
- [x] Install @anthropic-ai/sdk dependency
- [x] Implement Anthropic client integration
- [x] Add to provider selection menu
- [x] Support model fetching and selection
- [x] Add API key validation
- [x] Update all AI routing logic (initAI, isTerminalCommand, determineToolType)
- [x] Test with Anthropic API
- **GitHub Issue:** https://github.com/bvdr/BlueJay/issues/5
- **Pull Request:** https://github.com/bvdr/BlueJay/pull/6
- **Branch:** `feature/anthropic-provider`
- **Status:** ✅ Completed - Ready to Merge

### Task 2: Simplify Model Selection (5 Models Per Provider)
- [x] Define hardcoded model lists for Anthropic (completed in Task 1)
- [x] Update hardcoded model list for Google Gemini (5 models)
- [x] Update hardcoded model list for OpenAI (5 models)
- [x] Remove fetchOpenAIModels() function
- [x] Remove fetchGeminiModels() function
- [x] Remove helper functions (isTextCompletionModel, getLatestModelVersions, etc)
- [x] Update firstRunSetup() to use hardcoded models
- [x] Update showSettings() to use hardcoded models
- [x] Test all 3 providers with new model lists
- **GitHub Issue:** https://github.com/bvdr/BlueJay/issues/7
- **Pull Request:** https://github.com/bvdr/BlueJay/pull/8
- **Branch:** `feature/simplified-model-selection`
- **Status:** ✅ Completed - Merged

### Task 3: Add Password Masking for API Key Input
- [ ] Import password() from @clack/prompts
- [ ] Update checkOpenAIKey() to use password() instead of text()
- [ ] Update checkGeminiKey() to use password() instead of text()
- [ ] Update checkAnthropicKey() to use password() instead of text()
- [ ] Update updateCredentials() OpenAI case to use password()
- [ ] Update updateCredentials() Gemini case to use password()
- [ ] Update updateCredentials() Anthropic case to use password()
- [ ] Test masking behavior for all providers
- **GitHub Issue:** https://github.com/bvdr/BlueJay/issues/9
- **Branch:** `feature/password-masking`
- **Status:** In Progress

### Task 4: Add --help Flag Support
- [ ] Create comprehensive help screen
- [ ] Add examples and use cases
- [ ] Include API key links for all 3 providers (OpenAI, Gemini, Anthropic)
- [ ] Display current configuration status
- [ ] Handle -h, --help, and help variants
- **GitHub Issue:** [To be created]
- **Branch:** `feature/help-command`
- **Status:** Not Started

### Task 5: Enhance Empty Command Response
- [ ] Show configuration status prominently
- [ ] Add contextual guidance based on setup state
- [ ] Display quick examples for configured users
- [ ] Guide new users to setup process
- **GitHub Issue:** [To be created]
- **Branch:** `feature/enhanced-empty-command`
- **Status:** Not Started

### Task 6: Improve First-Run Setup Context
- [ ] Add welcome screen explaining the setup process
- [ ] Set user expectations (time, requirements)
- [ ] Show benefits of configuration
- [ ] Add provider comparison information
- **GitHub Issue:** [To be created]
- **Branch:** `feature/setup-context`
- **Status:** Not Started

### Task 7: Enhance API Key Prompts
- [ ] Add direct links for OpenAI API keys
- [ ] Add direct links for Gemini API keys
- [ ] Add direct links for Anthropic API keys
- [ ] Include cost estimates per provider
- [ ] Explain secure storage location
- **GitHub Issue:** [To be created]
- **Branch:** `feature/enhanced-api-prompts`
- **Status:** Not Started

---

## Progress Tracking
- **Total Tasks:** 7
- **Completed:** 2
- **In Progress:** 0
- **Not Started:** 5

## Completed Tasks
1. ✅ Task 1: Add Anthropic Claude as AI Provider - PR #6
2. ✅ Task 2: Simplify Model Selection (5 Models Per Provider) - PR #8
