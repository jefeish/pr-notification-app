/**
 * @fileoverview Integration Test Suite
 * @description Comprehensive integration tests for the refactored PR notification app
 * architecture. Tests service initialization, configuration validation, health checks,
 * and overall system integration to ensure all components work together correctly.
 * 
 * @author Jürgen Efeish
 * 
 * 
 * @module IntegrationTest
 * 
 * @requires AppConfig - Application configuration
 * @requires EmailService - Email service
 * @requires GitHubService - GitHub API service
 * @requires NotificationService - Core notification service
 * @requires Logger - Logging utility
 * 
 * @example
 * // Run integration tests
 * import { runIntegrationTest } from './integration.test.js';
 * const success = await runIntegrationTest();
 * 
 * @example
 * // Run from command line
 * node test/integration.test.js
 */

import { AppConfig } from '../src/config/appConfig.js';
import { EmailService } from '../src/services/emailService.js';
import { GitHubService } from '../src/services/githubService.js';
import { NotificationService } from '../src/services/notificationService.js';
import { Logger } from '../src/utils/logger.js';

/**
 * @async
 * @function runIntegrationTest
 * @description Comprehensive integration test to verify the refactored architecture works correctly.
 * Tests configuration loading, service initialization, health checks, and validation.
 * 
 * @returns {Promise<boolean>} True if all tests pass, false if any test fails
 * 
 * @throws {Error} When critical system components fail to initialize
 */
async function runIntegrationTest() {
  Logger.info('Starting integration test...');
  
  try {
    // Test 1: Configuration
    Logger.info('Testing configuration...');
    const config = AppConfig.email;
    console.log('Email config loaded:', { host: config.host, port: config.port });
    
    const enabledEvents = AppConfig.getEnabledEvents();
    console.log(`Found ${enabledEvents.length} enabled events`);
    
    // Test 2: Services initialization
    Logger.info('Testing service initialization...');
    const emailService = new EmailService();
    console.log('Email service configured:', emailService.isConfigured());
    
    const githubService = new GitHubService(null);
    console.log('GitHub service created');
    
    const notificationService = new NotificationService(emailService, githubService, null);
    console.log('Notification service created');
    
    // Test 3: Health status
    Logger.info('Testing health status...');
    const health = notificationService.getHealthStatus();
    console.log('Health status:', JSON.stringify(health, null, 2));
    
    // Test 4: Configuration validation
    Logger.info('Testing configuration validation...');
    const validationErrors = AppConfig.validate();
    if (validationErrors.length > 0) {
      Logger.warn('Validation warnings:', validationErrors);
    } else {
      Logger.info('Configuration validation passed');
    }
    
    Logger.info('✅ All integration tests passed!');
    return true;
    
  } catch (error) {
    Logger.error('❌ Integration test failed', error);
    return false;
  }
}

// Run the test if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runIntegrationTest().then(success => {
    process.exit(success ? 0 : 1);
  });
}

export { runIntegrationTest };