const emailService = require("../services/email.service");

function sendEmail(req, res, next) {
  try {
    return res.json(emailService.sendEmail(req.user.id, req.body));
  } catch (error) {
    return next(error);
  }
}

function getInbox(req, res, next) {
  try {
    return res.json(emailService.getInbox(req.user.id));
  } catch (error) {
    return next(error);
  }
}

function getSent(req, res, next) {
  try {
    return res.json(emailService.getSent(req.user.id));
  } catch (error) {
    return next(error);
  }
}

function getStarred(req, res, next) {
  try {
    return res.json(emailService.getStarred(req.user.id));
  } catch (error) {
    return next(error);
  }
}

function getTrash(req, res, next) {
  try {
    return res.json(emailService.getTrash(req.user.id));
  } catch (error) {
    return next(error);
  }
}

function searchEmails(req, res, next) {
  try {
    return res.json(emailService.searchEmails(req.user.id, req.query));
  } catch (error) {
    return next(error);
  }
}

function getUnreadCount(req, res, next) {
  try {
    return res.json(emailService.getUnreadCount(req.user.id));
  } catch (error) {
    return next(error);
  }
}

function getEmailById(req, res, next) {
  try {
    return res.json(emailService.getEmailById(req.user.id, req.params.id));
  } catch (error) {
    return next(error);
  }
}

function getEmailThread(req, res, next) {
  try {
    return res.json(emailService.getThread(req.user.id, parseInt(req.params.id, 10)));
  } catch (error) {
    return next(error);
  }
}

function toggleStar(req, res, next) {
  try {
    return res.json(emailService.toggleStar(req.user.id, parseInt(req.params.id, 10)));
  } catch (error) {
    return next(error);
  }
}

function updateReadStatus(req, res, next) {
  try {
    return res.json(
      emailService.updateReadStatus(req.user.id, parseInt(req.params.id, 10), req.body),
    );
  } catch (error) {
    return next(error);
  }
}

function moveToTrash(req, res, next) {
  try {
    return res.json(emailService.moveToTrash(req.user.id, parseInt(req.params.id, 10)));
  } catch (error) {
    return next(error);
  }
}

function restoreEmail(req, res, next) {
  try {
    return res.json(emailService.restoreEmail(req.user.id, parseInt(req.params.id, 10)));
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  getEmailById,
  getEmailThread,
  getInbox,
  getSent,
  getStarred,
  getTrash,
  getUnreadCount,
  moveToTrash,
  restoreEmail,
  searchEmails,
  sendEmail,
  toggleStar,
  updateReadStatus,
};
