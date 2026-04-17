import { pool } from "./pool.ts";
import { coerceUser, getUserSubmissionStats, anonymizeUserSubmissions, deleteUserData } from "./user.ts";
import { getConnectionBySubmitId, createConnection, deleteConnection, setLogsChannel, clearLogsChannel, getLogsChannel } from "./connection.ts";
import { createSubmission, countPendingSubmissions, claimNextSubmission, unclaimSubmission, approveSubmission, rejectSubmission, editAndApproveSubmission, dequeueApprovedSubmission, getSubmissionsForExport, importSubmissions } from "./submission.ts";
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
  getQueueSubmissions,
} from "./queue.ts";
import { isUserAdmin, isUserModerator, assignConnectionRole, removeConnectionRole, resetConnectionRoles } from "./role.ts";
import { canWhisper, createWhisper } from "./whisper.ts";
import { getConnectionConfig, setAllowedTypes, setWhisperAllowedTypes, setWhisperLimit, setWhisperPeriodMinutes, setWarnThresholdTemp, setWarnThresholdPerm, setTempBanDays, setLogExcludedEvents } from "./config.ts";
import { getDefaultConnection, setDefaultConnection } from "./global.ts";
import { issueWarning, getUserWarningCount, isUserBanned, getBanStatus, liftBan, removeWarnings } from "./warning.ts";
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
  isUserAdmin,
  isUserModerator,
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
  isUserBanned,
  getBanStatus,
  liftBan,
  removeWarnings,
  createStorageAdapter,
};
