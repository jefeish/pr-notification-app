import nock from "nock";
// Requiring our app implementation
import myProbotApp from "../index.js";
import { Probot, ProbotOctokit } from "probot";
// Requiring our fixtures
//import payload from "./fixtures/issues.opened.json" with { type: "json" };
const issueCreatedBody = { body: "Thanks for opening this issue!" };
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

import { describe, beforeEach, afterEach, test } from "node:test";
import assert from "node:assert";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const privateKey = fs.readFileSync(
  path.join(__dirname, "fixtures/mock-cert.pem"),
  "utf-8",
);

const payload = JSON.parse(
  fs.readFileSync(path.join(__dirname, "fixtures/issues.opened.json"), "utf-8"),
);

describe("My Probot app", () => {
  let probot;

  beforeEach(() => {
    nock.disableNetConnect();
    probot = new Probot({
      appId: 123,
      privateKey,
      // disable request throttling and retries for testing
      Octokit: ProbotOctokit.defaults({
        retry: { enabled: false },
        throttle: { enabled: false },
      }),
    });
    // Load our app into probot
    probot.load(myProbotApp);
  });

  test("creates a comment when an issue is opened", async () => {
    const mock = nock("https://api.github.com")
      // Test that we correctly return a test token
      .post("/app/installations/2/access_tokens")
      .reply(200, {
        token: "test",
        permissions: {
          issues: "write",
        },
      })

      // Test that a comment is posted
      .post("/repos/hiimbex/testing-things/issues/1/comments", (body) => {
        assert.deepEqual(body, issueCreatedBody);
        return true;
      })
      .reply(200);

    // Receive a webhook event
    await probot.receive({ name: "issues", payload });

    assert.deepStrictEqual(mock.pendingMocks(), []);
  });

  test("handles check run completed event without SMTP configured", async () => {
    // Don't set SMTP credentials to test the skip path
    
    const checkRunPayload = JSON.parse(
      fs.readFileSync(path.join(__dirname, "fixtures/check_run.completed.json"), "utf-8"),
    );

    const mock = nock("https://api.github.com")
      // Test that we correctly return a test token
      .post("/app/installations/2/access_tokens")
      .reply(200, {
        token: "test",
        permissions: {
          checks: "read",
          contents: "read",
          pull_requests: "read",
        },
      })
      // Mock the API call to get pull requests for commit
      .get("/repos/github/hello-world/commits/ce587453ced02b1526dfb4cb910479d431683101/pulls")
      .reply(200, [
        {
          number: 1,
          title: "Test Pull Request",
          user: {
            login: "github"
          },
          html_url: "https://github.com/github/hello-world/pull/1"
        }
      ])
      // Mock the API call to get user details
      .get("/users/github")
      .reply(200, {
        login: "github",
        email: null
      });

    // Receive a webhook event
    await probot.receive({ name: "check_run", payload: checkRunPayload });

    assert.deepStrictEqual(mock.pendingMocks(), []);
  });

  afterEach(() => {
    nock.cleanAll();
    nock.enableNetConnect();
  });
});

// For more information about testing with Jest see:
// https://facebook.github.io/jest/

// For more information about testing with Nock see:
// https://github.com/nock/nock
