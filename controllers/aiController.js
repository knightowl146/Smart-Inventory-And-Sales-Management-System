const Briefing = require("../models/Briefing");
const AiCall = require("../models/AiCall");
const { ask } = require("../services/ai/ask");
const { generateBriefing } = require("../services/ai/briefing");
const { isConfigured, MONTHLY_BUDGET_USD, monthlySpend } = require("../services/ai/client");
const audit = require("../services/auditService");

const MAX_QUESTION_LENGTH = 500;

//<---------------- POST /api/ai/ask ---------------->
const askQuestion = async (req, res, next) => {
  try {
    const { question } = req.body || {};

    if (typeof question !== "string" || question.trim().length === 0) {
      return res.status(400).json({ success: false, message: "A question is required" });
    }

    if (question.length > MAX_QUESTION_LENGTH) {
      return res.status(400).json({
        success: false,
        message: `Questions are limited to ${MAX_QUESTION_LENGTH} characters`,
      });
    }

    const result = await ask(question.trim(), req.user);

    // Worth recording: it shows who asked what, and a spike of refusals is
    // itself a signal an owner might want to see.
    audit.record({
      action: "ai.ask",
      outcome: result.refused ? "failure" : "success",
      meta: {
        question: question.trim().slice(0, 200),
        tools: result.toolCalls.map((call) => call.name),
        refused: result.refused,
      },
    });

    return res.status(200).json({
      success: true,
      data: {
        question: question.trim(),
        answer: result.answer,
        // Shown in the UI so the person can see which lookups produced the
        // answer rather than taking the prose on trust.
        toolCalls: result.toolCalls,
        refused: result.refused,
        assistantAvailable: result.available,
      },
    });
  } catch (err) {
    return next(err);
  }
};

//<---------------- GET /api/ai/status ---------------->
const getAiStatus = async (req, res, next) => {
  try {
    const spent = await monthlySpend();

    return res.status(200).json({
      success: true,
      data: {
        configured: isConfigured(),
        monthlyBudgetUsd: MONTHLY_BUDGET_USD,
        estimatedSpendThisMonthUsd: Number(spent.toFixed(4)),
        budgetRemainingPercent: Number(
          (Math.max(0, 1 - spent / MONTHLY_BUDGET_USD) * 100).toFixed(1)
        ),
      },
    });
  } catch (err) {
    return next(err);
  }
};

//<---------------- GET /api/ai/usage ---------------->
const getAiUsage = async (req, res, next) => {
  try {
    const since = new Date();
    since.setDate(since.getDate() - 30);

    const byFeature = await AiCall.aggregate([
      { $match: { createdAt: { $gte: since } } },
      {
        $group: {
          _id: "$feature",
          calls: { $sum: 1 },
          cached: { $sum: { $cond: ["$cached", 1, 0] } },
          failed: { $sum: { $cond: ["$ok", 0, 1] } },
          totalTokens: { $sum: "$totalTokens" },
          estimatedCostUsd: { $sum: "$estimatedCostUsd" },
          averageLatencyMs: { $avg: "$latencyMs" },
        },
      },
      { $sort: { estimatedCostUsd: -1 } },
    ]);

    return res.status(200).json({
      success: true,
      data: {
        windowDays: 30,
        features: byFeature.map((row) => ({
          feature: row._id,
          calls: row.calls,
          cacheHits: row.cached,
          failures: row.failed,
          totalTokens: row.totalTokens,
          estimatedCostUsd: Number(row.estimatedCostUsd.toFixed(4)),
          averageLatencyMs: Math.round(row.averageLatencyMs || 0),
        })),
      },
    });
  } catch (err) {
    return next(err);
  }
};

//<---------------- GET /api/ai/briefings ---------------->
const listBriefings = async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 10, 50);

    const briefings = await Briefing.find().sort({ periodEnd: -1 }).limit(limit);

    return res.status(200).json({ success: true, data: briefings });
  } catch (err) {
    return next(err);
  }
};

//<---------------- POST /api/ai/briefings ---------------->
const createBriefing = async (req, res, next) => {
  try {
    const days = Math.min(Math.max(Number(req.body?.days) || 7, 1), 90);
    const briefing = await generateBriefing({ days, userId: req.user.id });

    audit.record({
      action: "ai.briefing_generated",
      entityType: "Briefing",
      entityId: briefing._id,
      meta: { days, source: briefing.source },
    });

    return res.status(201).json({ success: true, data: briefing });
  } catch (err) {
    return next(err);
  }
};

module.exports = { askQuestion, getAiStatus, getAiUsage, listBriefings, createBriefing };
