const TurnIntegration = require("./index");

const app = new TurnIntegration(process.env.SECRET)
  .context("Language", "table", message => ({
    Language: "English",
    Confidence: "Very high"
  }))
  .context("A list of things", "ordered-list", message => [
    "first item",
    "second item",
    "third item"
  ])
  .suggest(message => [
    {
      type: "TEXT",
      title: "Password reset",
      body: "To reset your password click the link on the login page.",
      confidence: 0.4
    }
  ])
  .action(message => [
    {
      description: "Change Language",
      payload: {
        really: "yes"
      },
      options: {
        afr_ZA: "Afrikaans",
        eng_ZA: "English",
        zul_ZA: "Zulu"
      },
      callback: ({ message, option, payload: { really } }) => {
        console.log({ message, option, really });
      }
    }
  ])
  .serve();

const port = process.env.PORT || 3000;

app.listen(port, () => console.log(`Example app listening on port ${port}!`));
