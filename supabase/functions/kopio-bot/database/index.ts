import { pool } from "./pool.ts";
import { coerceUser, getUserSubmissionStats, anonymizeUserSubmissions, deleteUserData } from "./user.ts";
import { getConnectionBySubmitId, createConnection, deleteConnection, setLogsChannel, clearLogsChannel, getLogsChannel } from "./connection.ts";
import { createSubmission, countPendingSubmissions, claimNextSubmission, unclaimSubmission, approveSubmission, rejectSubmission, editAndApproveSubmission, dequeueApprovedSubmission, getSubmissionsForExport, importSubmissions, getConnectionSubmissionStats } from "./submission.ts";
import {
  createQueue,
  getQueuesForConnection,
  deleteQueue,
  assignSubmissionToQueue,
  clearLowAlertIfAboveThreshold,
  getAllQueuesWithPending,
  dequeueFromQueue,
  updateLastPosted,
  countQueueApproved,
  incrementCounter,
  markLowAlertSent,
  getQueueTemplate,
  upsertQueueTemplate,
  getUnqueuedSubmissions,
  getQueueSubmissions,
} from "./queue.ts";
import { getConnectionRole, assignConnectionRole, removeConnectionRole, resetConnectionRoles } from "./role.ts";
export type { ConnectionRole } from "./role.ts";
import { canWhisper, createWhisper } from "./whisper.ts";
import { getConnectionConfig, setAllowedTypes, setWhisperAllowedTypes, setWhisperLimit, setWhisperPeriodMinutes, setWarnThresholdTemp, setWarnThresholdPerm, setTempBanDays, setLogExcludedEvents } from "./config.ts";
import { getDefaultConnection, setDefaultConnection } from "./global.ts";
import { issueWarning, getUserWarningCount, getWarningDetails, isUserBanned, getBanStatus, liftBan, removeWarnings, createAppeal, getAppeal, liftAppeal, rejectAppeal } from "./warning.ts";
export type { Appeal, WarningDetail } from "./warning.ts";
import { createStorageAdapter } from "./storage.ts";

export type { PendingSubmission, ApprovedSubmission, ExportRow, ImportInput } from "./submission.ts";
export type { Queue, QueueTemplate, CreateQueueParams } from "./queue.ts";
export type { ContentType, ConnectionConfig, LogEventType } from "./config.ts";

export default {
  pool,
  coerceUser,
  getConnectionBySubmitId,
  createConnection,
  deleteConnection,
  setLogsChannel,
  clearLogsChannel,
  getLogsChannel,
  createSubmission,
  getConnectionRole,
  assignConnectionRole,
  removeConnectionRole,
  resetConnectionRoles,
  countPendingSubmissions,
  claimNextSubmission,
  unclaimSubmission,
  approveSubmission,
  rejectSubmission,
  editAndApproveSubmission,
  getUserSubmissionStats,
  getConnectionSubmissionStats,
  anonymizeUserSubmissions,
  deleteUserData,
  dequeueApprovedSubmission,
  getSubmissionsForExport,
  importSubmissions,
  createQueue,
  getQueuesForConnection,
  deleteQueue,
  assignSubmissionToQueue,
  clearLowAlertIfAboveThreshold,
  getAllQueuesWithPending,
  dequeueFromQueue,
  updateLastPosted,
  countQueueApproved,
  incrementCounter,
  markLowAlertSent,
  getQueueTemplate,
  upsertQueueTemplate,
  getUnqueuedSubmissions,
  getQueueSubmissions,
  canWhisper,
  createWhisper,
  getConnectionConfig,
  setAllowedTypes,
  setWhisperAllowedTypes,
  setWhisperLimit,
  setWhisperPeriodMinutes,
  setWarnThresholdTemp,
  setWarnThresholdPerm,
  setTempBanDays,
  setLogExcludedEvents,
  getDefaultConnection,
  setDefaultConnection,
  issueWarning,
  getUserWarningCount,
  getWarningDetails,
  isUserBanned,
  getBanStatus,
  liftBan,
  removeWarnings,
  createAppeal,
  getAppeal,
  liftAppeal,
  rejectAppeal,
  createStorageAdapter,
};
