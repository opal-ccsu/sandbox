/**
 * SCORM 2004 API Wrapper
 * Handles all LMS communication for Module 0: CR Path
 * v1.3 — Fixed: Cache learner_id and learner_name on init
 *         to survive any session issues
 *         Fixed: cmi.exit = "suspend" before Terminate
 */

var SCORM = (function() {
  var api = null;
  var initialized = false;
  var _learnerID = "";
  var _learnerName = "";

  function findAPI(win) {
    var attempts = 0;
    try {
      while ((!win.API_1484_11) && (win.parent) && (win.parent != win)) {
        attempts++;
        if (attempts > 10) return null;
        win = win.parent;
      }
      return win.API_1484_11 || null;
    } catch (e) {
      // 2026-09-21: a window from another site (a Blackboard page that opened this tab, or one that frames it)
      // cannot be inspected, and the browser throws. The old code crashed here and the module never started.
      // No LMS is reachable through that window: carry on as the website.
      return null;
    }
  }

  function getAPI() {
    if (api) return api;
    api = findAPI(window);
    if (!api && window.opener) {
      api = findAPI(window.opener);
    }
    return api;
  }

  return {
    init: function() {
      var lmsAPI = getAPI();
      if (lmsAPI) {
        var result = lmsAPI.Initialize("");
        initialized = (result === "true" || result === true);
        if (initialized) {
          // Cache read-only LMS values immediately
          var id = lmsAPI.GetValue("cmi.learner_id") || "";
          var name = lmsAPI.GetValue("cmi.learner_name") || "";
          if (id) _learnerID = id;
          if (name) _learnerName = name;

          // Only set incomplete if not already set from a previous session
          var currentStatus = lmsAPI.GetValue("cmi.completion_status");
          if (!currentStatus || currentStatus === "not attempted" || currentStatus === "unknown") {
            lmsAPI.SetValue("cmi.completion_status", "incomplete");
          }

          lmsAPI.SetValue("cmi.exit", "suspend");
          lmsAPI.Commit("");
        }
      } else {
        console.warn("SCORM API not found. Running in standalone mode.");
        initialized = false;
      }
      return initialized;
    },

    getValue: function(key) {
      var lmsAPI = getAPI();
      if (lmsAPI && initialized) {
        return lmsAPI.GetValue(key);
      }
      return localStorage.getItem("scorm_" + key) || "";
    },

    setValue: function(key, value) {
      var lmsAPI = getAPI();
      if (lmsAPI && initialized) {
        lmsAPI.SetValue(key, value);
        lmsAPI.Commit("");
      } else {
        localStorage.setItem("scorm_" + key, value);
      }
    },

    setInteraction: function(index, id, type, response) {
      var prefix = "cmi.interactions." + index;
      this.setValue(prefix + ".id", id);
      this.setValue(prefix + ".type", type);
      this.setValue(prefix + ".learner_response", response.substring(0, 4000));
      this.setValue(prefix + ".timestamp", new Date().toISOString());
    },

    getSuspendData: function() {
      var raw = this.getValue("cmi.suspend_data");
      if (raw) {
        try { return JSON.parse(raw); }
        catch(e) { return {}; }
      }
      return {};
    },

    setSuspendData: function(data) {
      this.setValue("cmi.suspend_data", JSON.stringify(data));
    },

    setLocation: function(page) {
      this.setValue("cmi.location", String(page));
    },

    getLocation: function() {
      return this.getValue("cmi.location") || "1";
    },

    getLearnerID: function() {
      return _learnerID || this.getValue("cmi.learner_id") || "";
    },

    getLearnerName: function() {
      return _learnerName || this.getValue("cmi.learner_name") || "";
    },

    setScore: function() {
      this.setValue("cmi.score.raw", "100");
      this.setValue("cmi.score.min", "0");
      this.setValue("cmi.score.max", "100");
      this.setValue("cmi.score.scaled", "1.0");
      this.setValue("cmi.success_status", "passed");
      // NOTE: Do NOT set cmi.completion_status to "completed"
      // This keeps the single attempt resumable on Rustici/Bb Ultra
    },

    setProgressMeasure: function(value) {
      this.setValue("cmi.progress_measure", String(value));
    },

    terminate: function() {
      var lmsAPI = getAPI();
      if (lmsAPI && initialized) {
        lmsAPI.SetValue("cmi.exit", "suspend");
        lmsAPI.Commit("");
        lmsAPI.Terminate("");
        initialized = false;
      }
    },

    reset: function() {
      this.setValue("cmi.suspend_data", "");
      this.setValue("cmi.location", "");
      this.setValue("cmi.completion_status", "incomplete");
      this.setValue("cmi.success_status", "unknown");
      this.setValue("cmi.score.raw", "");
      this.setValue("cmi.score.min", "");
      this.setValue("cmi.score.max", "");
      this.setValue("cmi.score.scaled", "");
      this.setValue("cmi.progress_measure", "");
      var keysToRemove = [];
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf("scorm_") === 0) {
          keysToRemove.push(k);
        }
      }
      keysToRemove.forEach(function(k) { localStorage.removeItem(k); });
      _learnerID = "";
      _learnerName = "";
      console.log("[SCORM] Reset complete.");
    }

  };
})();

