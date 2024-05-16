const express = require("express");
const { generateSlug } = require("random-word-slugs");
const { ECSClient, RunTaskCommand } = require("@aws-sdk/client-ecs");
const Redis = require("ioredis");
const { Server } = require("socket.io");
const cors = require("cors");

const app = express();
const PORT = 9000;
const SOCKET_PORT = 9002;

const suscriber = new Redis(process.env.REDIS_URI);

const io = new Server({ cors: { origin: "*" } });
io.listen(9002, () =>
  console.log(`Socket server is running on port ${SOCKET_PORT}`)
);

io.on("connection", (socket) => {
  socket.on("subscribe", (channel) => {
    socket.join(channel);
    socket.emit("message", `subscribe ${channel}`);
  });
});
app.use(cors());
app.use(express.json());

const ecsClient = new ECSClient({
  region: "ap-south-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY,
    secretAccessKey: process.env.AWS_SECRET_KEY,
  },
});

const config = {
  CLUSTER: process.env.CLUSTER_ARN,
  TASKDEFINATION: process.env.TASK_DEF_ARN,
};

app.post("/project", async (req, res) => {
  const { gitURL, slug } = req.body;
  const projectSlug = slug ? slug : generateSlug();

  const command = new RunTaskCommand({
    cluster: config.CLUSTER,
    taskDefinition: config.TASKDEFINATION,
    launchType: "FARGATE",
    count: 1,
    networkConfiguration: {
      awsvpcConfiguration: {
        assignPublicIp: "ENABLED",
        subnets: [
          "subnet-0cd2dd6267d0eb859",
          "subnet-071c12bc875fa117b",
          "subnet-03d75a071267f348b",
        ],
        securityGroups: ["sg-06901783bd30071d0"],
      },
    },
    overrides: {
      containerOverrides: [
        {
          name: "deployesy-builder-image",
          environment: [
            {
              name: "GIT_REPOSITORY_URL",
              value: gitURL,
            },
            {
              name: "PROJECT_ID",
              value: projectSlug,
            },
          ],
        },
      ],
    },
  });

  await ecsClient.send(command);

  return res.json({
    status: "Queued",
    data: { projectSlug, url: `http://${projectSlug}.localhost:8000` },
  });
});

async function redisSubscriber() {
  console.log("Subscribed to logs");
  suscriber.psubscribe("logs:*");
  suscriber.on("pmessage", (pattern, channel, message) => {
    io.to(channel).emit("message", message);
  });
}

redisSubscriber();

app.listen(PORT, () => console.log(`API server is running on port ${PORT}`));
