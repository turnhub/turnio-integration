var request = require("supertest");
var crypto = require("crypto");
var assert = require("chai").assert;
var TurnIntegration = require("./index");

describe("turn integration app", function () {
  let emptyServer;
  let configuredServer;
  let secret = "secret";
  let hmac;

  const sign = (payload) =>
    crypto
      .createHmac("sha256", Buffer.from(secret, "utf8"))
      .update(JSON.stringify(payload))
      .digest()
      .toString("base64");

  beforeEach(function () {
    emptyServer = new TurnIntegration(secret).serve();
    configuredServer = new TurnIntegration(secret)
      .ignoreSignature()
      .pathPrefix("/")
      .verbose()
      .context("Language", "table", (message) => ({
        Language: "English",
        Confidence: "Very high",
      }))
      .context("A list of things", "ordered-list", (message) => [
        "first item",
        "second item",
        "third item",
      ])
      .suggest((message) => [
        {
          type: "TEXT",
          title: "Password reset",
          body: "To reset your password click the link on the login page.",
          confidence: 0.4,
        },
      ])
      .action((message) => [
        {
          description: "Change Language",
          payload: {
            really: "yes",
          },
          options: {
            afr_ZA: "Afrikaans",
            eng_ZA: "English",
            zul_ZA: "Zulu",
          },
          callback: ({ payload: { really } }) => {
            return { really };
          },
        },
      ])
      .webhook("my-webhook", (req, resp, next) => {
        resp.send({ ok: "cool" });
      })
      .serve();
  });

  describe("when checking the HTTP header signature", () => {
    it("should reject the HTTP requests with an invalid signature", () => {
      const payload = { name: "Manny", species: "cat" };
      request(emptyServer)
        .post("/")
        .send(payload)
        .set("Content-Type", "application/json")
        .set("X-Turn-Hook-Signature", sign({ foo: "bar" })) // signing for a different payload
        .expect(400);
    });

    it("should accept the HTTP requests with a valid signature", () => {
      const payload = { name: "Manny", species: "cat" };
      request(emptyServer)
        .post("/")
        .send(payload)
        .set("Content-Type", "application/json")
        .set("X-Turn-Hook-Signature", sign(payload))
        .expect(200);
    });
  });

  describe("health", () => {
    it("should return 200", () => {
      request(emptyServer).get("/health").expect(200);
    });
  });

  describe("when handshaking", () => {
    it("should return the capabilities of the empty server", () => {
      const payload = { handshake: true };

      request(emptyServer)
        .post("/")
        .send(payload)
        .set("Content-Type", "application/json")
        .set("X-Turn-Hook-Signature", sign(payload))
        .expect(200, {
          capabilities: {
            actions: false,
            suggested_responses: false,
            context_objects: [],
          },
        });
    });

    it("should return the capabilities of the configured server", () => {
      const payload = { handshake: true };

      request(configuredServer)
        .post("/")
        .send(payload)
        .set("Content-Type", "application/json")
        .set("X-Turn-Hook-Signature", sign(payload))
        .expect(200, (err, res) => {
          const {
            capabilities: { actions, suggested_responses, context_objects },
          } = res.body;
          assert.ok(actions);
          assert.ok(suggested_responses);
          assert.deepEqual(context_objects, [
            {
              title: "Language",
              code: "ctx-0",
              type: "table",
              icon: "none",
            },
            {
              title: "A list of things",
              code: "ctx-1",
              type: "ordered-list",
              icon: "none",
            },
          ]);
        });
    });
  });

  describe("when requesting an update", () => {
    it("should return the values for the context objects, actions, and suggestions", () => {
      request(configuredServer)
        .post("/")
        .send({ message: "payload" })
        .expect(200, (err, res) => {
          return assert.deepEqual(res.body, {
            actions: {
              "act-0-0": {
                description: "Change Language",
                options: {
                  afr_ZA: "Afrikaans",
                  eng_ZA: "English",
                  zul_ZA: "Zulu",
                },
                payload: {
                  really: "yes",
                },
                url: "/action/0/0",
              },
            },
            suggested_responses: [
              {
                type: "TEXT",
                title: "Password reset",
                body:
                  "To reset your password click the link on the login page.",
                confidence: 0.4,
              },
            ],
            context_objects: {
              "ctx-0": {
                Language: "English",
                Confidence: "Very high",
              },
              "ctx-1": ["first item", "second item", "third item"],
            },
          });
        });
    });

    it("should act on action callbacks", () => {
      return request(configuredServer)
        .post("/action/0/0")
        .send({ message: "message", option: "foo", payload: { really: "yes" } })
        .expect(200, {
          really: "yes",
        });
    });

    it("should act on webhook callbacks", () => {
      return request(configuredServer)
        .post("/webhook/my-webhook")
        .set("Content-Type", "application/json")
        .set("X-Turn-Hook-Signature", sign({}))
        .send({})
        .expect(200, {
          ok: "cool",
        });
    });

    it("should 404 on non existent webhooks", () => {
      return request(configuredServer)
        .post("/webhook/this-does-not-exist")
        .set("Content-Type", "application/json")
        .set("X-Turn-Hook-Signature", sign({}))
        .send({})
        .expect(404, "Not Found");
    });
  });
});
