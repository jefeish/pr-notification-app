/**
 * Example of what the enhanced check run notifications will show
 */

console.log("🎯 ENHANCED CHECK RUN NOTIFICATIONS 🎯\n");

console.log("Example 1: Mixed Results (1 failed, 1 passed, 1 in progress)");
console.log("Subject: ❌ 1 check failed, 1 passed");
console.log("Description:");
console.log(`**Check Run Summary**

🔄 **1 check still running**

**Status Overview:**
• ✅ Passed: 1
• ❌ Failed: 1
• 🔄 In Progress: 1

**❌ Failed Checks:**
• **Build** (failure)

**✅ Passed Checks:**
• **Tests**

**🔄 Still Running:**
• **Deploy** (in_progress)
`);

console.log("\n" + "=".repeat(60) + "\n");

console.log("Example 2: All Checks Passed");
console.log("Subject: ✅ All 3 checks passed");
console.log("Description:");
console.log(`**Check Run Summary**

🎯 **All checks completed**

**Status Overview:**
• ✅ Passed: 3
• ❌ Failed: 0

**✅ Passed Checks:**
• **Build**
• **Tests** 
• **Security Scan**
`);

console.log("\n" + "=".repeat(60) + "\n");

console.log("Example 3: Multiple Failures");
console.log("Subject: ❌ 2 checks failed, 1 passed");
console.log("Description:");
console.log(`**Check Run Summary**

🎯 **All checks completed**

**Status Overview:**
• ✅ Passed: 1
• ❌ Failed: 2

**❌ Failed Checks:**
• **Build** (failure)
• **Tests** (failure)

**✅ Passed Checks:**
• **Linting**
`);

console.log("\n🚀 Your app will now provide comprehensive status for all checks!");
console.log("🔥 Features added:");
console.log("  ✅ Shows both passed and failed checks");
console.log("  ✅ Indicates checks still in progress");
console.log("  ✅ Smart subject lines with emoji status");
console.log("  ✅ Detailed breakdown of all check results");
console.log("  ✅ Priority based on overall status (failures = high priority)");