const { exec } = require("child_process");
const path = require("path");
const fs = require("fs");
const { S3Client, PutObjectCommand } = require("@aws-sdk/client-s3");
const mime = require("mime-types");
const Redis = require("ioredis");

const publisher = new Redis(process.env.REDIS_URI);
const PROJECT_ID = process.env.PROJECT_ID;

function publishLogs(log) {
  publisher.publish(`logs:${PROJECT_ID}`, JSON.stringify({ log }));
}
const s3Client = new S3Client({
  region: "ap-south-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY,
    secretAccessKey: process.env.AWS_SECRET_KEY,
  },
});

async function init() {
  console.log(
    "----------------------------------------Executing script.js----------------------------------------"
  );
  const outDirPath = path.join(__dirname, "output");
  console.log("Build started");
  publishLogs("-------------------Build started---------------------");

  const p = exec(`cd ${outDirPath} && npm install && npm run build`);

  p.stdout.on("data", (data) => {
    console.log(data.toString());
    publishLogs(data.toString());
  });
  p.stdout.on("error", (data) => {
    console.log("ERROR", data.toString());
    publishLogs(`error: ${data.toString()}`);
  });

  p.on("close", async function (code) {
    console.log("Build Complete");
    publishLogs("Build Complete");
    const distFolderPath = path.join(__dirname, "output", "dist");
    const distFolderContent = fs.readdirSync(distFolderPath, {
      recursive: true,
    });

    publishLogs("Uploading files ...");

    for (const file of distFolderContent) {
      const filePath = path.join(distFolderPath, file);
      if (fs.lstatSync(filePath).isDirectory()) continue;

      console.log("Uploading", filePath);
      publishLogs(`Uploading ${file}`);

      const putCmd = new PutObjectCommand({
        Bucket: "deployesy",
        Key: `__outputs/${PROJECT_ID}/${file}`,
        Body: fs.createReadStream(filePath),
        ContentType: mime.lookup(filePath),
      });
      await s3Client.send(putCmd);

      console.log("Uploaded", filePath);
      publishLogs(`Uploaded ${file}`);
    }

    console.log("Completed uploading in S3...");
    publishLogs("Completed uploading ...");
  });
}

init();
