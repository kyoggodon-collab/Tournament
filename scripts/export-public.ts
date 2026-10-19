import fs from "node:fs";

const source = "data/tournament.json";
const dest = "shared/published.json";

if (!fs.existsSync(source)) {
  if (!fs.existsSync(dest)) {
    throw new Error("共有用の published.json がありません");
  }
  console.log("keep existing published.json");
  process.exit(0);
}

const data = JSON.parse(fs.readFileSync(source, "utf8")) as {
  settings: { sessionSecret?: string };
};
data.settings.sessionSecret = "";
fs.writeFileSync(dest, `${JSON.stringify(data, null, 2)}\n`);
console.log(`wrote ${dest}`);
