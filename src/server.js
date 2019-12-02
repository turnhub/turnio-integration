const TurnIntegration = require("./index");

const app = new TurnIntegration(process.env.SECRET)
  .context("Language", "table", ({ chat, messages }) => ({
    Language: "English",
    Confidence: "Very high"
  }))
  .context("A list of things", "ordered-list", ({ chat, messages }) => [
    "first item",
    "second item",
    "third item"
  ])
  .suggest(({ chat, messages }) => [
    {
      type: "TEXT",
      title: "Password reset",
      body: "To reset your password click the link on the login page.",
      confidence: 0.4
    }
  ])
  .action(({ chat, messages }) => [
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
      callback: ({ message, option, payload: { really } }, resp) => {
        console.log({ message, option, really });
        // Notify the frontend to refresh the context by setting
        // the response header
        resp.setHeader("X-Turn-Integration-Refresh", "true");
        // this is return as JSON in the HTTP response
        return { ok: "done" };
      }
    }
  ])
  .serve();

const port = process.env.PORT || 3000;

app.listen(port, () => console.log(`Example app listening on port ${port}!`));
