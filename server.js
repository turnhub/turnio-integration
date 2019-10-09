const TurnIntegration = require("./turn");

const app = new TurnIntegration()
  .context("Language", TurnIntegration.TABLE, message => ({
    Language: "English",
    Confidence: "Very high"
  }))
  .context("A list of things", TurnIntegration.ORDERED_LIST, message => [
    "first item",
    "second item",
    "third item"
  ])
  .suggest(message => ({
    type: TurnIntegration.TEXT,
    title: "Password reset",
    body: "To reset your password click the link on the login page.",
    confidence: 0.4
  }))
  .action(message => ({
    description: "Change Language",
    payload: {
      really: "yes"
    },
    options: {
      afr_ZA: "Afrikaans",
      eng_ZA: "English",
      zul_ZA: "Zulu"
    },
    callback: ({ really }) => {
      console.log("this menu item was called");
    }
  }))
  .serve();

module.exports = app;
