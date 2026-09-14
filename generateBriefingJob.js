require("dotenv").config();

const mongoose = require("mongoose");
const connectDB = require("./config/db");
const logger = require("./utils/logger");
const { generateBriefing } = require("./services/ai/briefing");

/**
 * The weekly briefing job.
 *
 * Meant for a scheduler rather than a person - a Render cron job, a GitHub
 * Actions schedule, or plain crontab:
 *
 *   0 7 * * 1  cd /app && npm run briefing
 *
 * One model call a week, which is why this feature is cheap enough to leave
 * switched on. If Gemini is unavailable or the monthly budget is spent, the
 * briefing is still written - from the same figures, in plainer words - so a
 * missed week never leaves a gap in the record.
 */
const run = async () => {
  const days = Number(process.env.BRIEFING_DAYS || 7);

  await connectDB();

  const briefing = await generateBriefing({ days });

  logger.info(
    `Briefing written for ${briefing.periodStart.toISOString().slice(0, 10)} to ${briefing.periodEnd
      .toISOString()
      .slice(0, 10)} (${briefing.source}): ${briefing.headline}`
  );
};

run()
  .catch((err) => {
    logger.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState !== 0) await mongoose.disconnect();
  });
