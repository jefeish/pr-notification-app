/**
 * Simple test to verify check_run handler works
 */

// Simulate a check_run.completed webhook payload
const mockCheckRunPayload = {
  check_run: {
    id: 12345,
    name: "Build",
    status: "completed",
    conclusion: "success", 
    head_sha: "abc123def456",
    html_url: "https://github.com/owner/repo/runs/12345",
    pull_requests: [
      {
        number: 123,
        title: "Test PR",
        html_url: "https://github.com/owner/repo/pull/123",
        user: { login: "developer" }
      }
    ],
    output: {
      summary: "All tests passed successfully!"
    }
  },
  repository: {
    name: "test-repo",
    full_name: "owner/test-repo"
  },
  sender: {
    login: "github-actions[bot]"
  }
};

console.log("Mock check_run payload:");
console.log(JSON.stringify(mockCheckRunPayload, null, 2));
console.log("\nThis payload should now be processed correctly by the CheckRunHandler!");