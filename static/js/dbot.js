/* ═══════════════════════════════════════════════════════════
   Autonix DBot — Visual Bot Builder  •  v2
   All trade settings are driven exclusively by the loaded XML.
   ═══════════════════════════════════════════════════════════ */
(function () {
  "use strict";

  /* guard: only run on the DBot page */
  if (!document.getElementById("dbot-root")) return;

  /* ── tiny helpers ───────────────────────────────────────── */
  var $ = function (id) {
    return document.getElementById(id);
  };
  var fmtPL = function (n) {
    var s = Math.abs(n).toFixed(2);
    return (n >= 0 ? "+" : "−") + "$" + s;
  };
  var fmtUSD = function (n) {
    return "$" + Math.abs(+n).toFixed(2);
  };
  var now = function () {
    var d = new Date();
    return [d.getHours(), d.getMinutes(), d.getSeconds()]
      .map(function (v) {
        return String(v).padStart(2, "0");
      })
      .join(":");
  };

  /* Dynamically load scripts (used to fetch Blockly on-demand) */
  function loadScript(url) {
    return new Promise(function (resolve, reject) {
      try {
        var s = document.createElement("script");
        s.src = url;
        s.async = false;
        s.onload = function () {
          resolve(true);
        };
        s.onerror = function () {
          reject(new Error("Failed to load " + url));
        };
        document.head.appendChild(s);
      } catch (e) {
        reject(e);
      }
    });
  }

  function ensureBlocklyLoaded() {
    if (typeof Blockly !== "undefined") return Promise.resolve(true);
    if (window._autonix_blockly_loader)
      return window._autonix_blockly_loader;
    var base = "https://cdn.jsdelivr.net/npm/blockly@10.4.3/";
    var urls = [base + "blockly_compressed.js", base + "blocks_compressed.js", base + "msg/en.js"];
    var p = loadScript(urls[0])
      .then(function () {
        return loadScript(urls[1]);
      })
      .then(function () {
        return loadScript(urls[2]);
      })
      .then(function () {
        return true;
      })
      .catch(function (e) {
        console.warn("[DBot] dynamic Blockly load failed:", e);
        try {
          showToast("Failed to load Blockly. Blocks UI unavailable.", "red", 4000);
        } catch (ee) {}
        return false;
      })
      .finally(function () {
        window._autonix_blockly_loader = null;
      });
    window._autonix_blockly_loader = p;
    return p;
  }

  /* ═══════════════════════════════════════════════════════════
     DEFAULT BOT TEMPLATES  (10 strategies)
     XML is built to render correctly in Blockly 10:
       • <mutation else="1"> is the FIRST child of controls_if
       • value inputs use <shadow> (not <block>) for defaults
       • no fixed block IDs (Blockly generates them)
     ═══════════════════════════════════════════════════════════ */

  function buildXml(o) {
    /* o = { symbol, contract, barrier, duration, dunit, stake, mart, tp, sl } */
    var hasPrediction = /^DIGIT(OVER|UNDER|DIFF|MATCH)$/.test(o.contract);
    var predBlock = hasPrediction
      ? '<value name="PREDICTION"><shadow type="math_number"><field name="NUM">' +
        o.barrier +
        "</field></shadow></value>"
      : "";
    var tp = o.tp || 1;
    var sl = o.sl || 20;
    return [
      '<xml xmlns="https://developers.google.com/blockly/xml">',
      '<block type="trade_definition" x="60" y="60">',
      '  <statement name="SUBMARKET">',
      '    <block type="trade_definition_market">',
      '      <field name="MARKET_LIST">synthetic_index</field>',
      '      <field name="SUBMARKET_LIST">random_index</field>',
      '      <field name="SYMBOL_LIST">' + o.symbol + "</field>",
      "    </block>",
      "  </statement>",
      '  <statement name="TRADEOPTIONS">',
      '    <block type="trade_definition_tradeoptions">',
      '      <field name="DURATIONTYPE_LIST">' + o.dunit + "</field>",
      '      <field name="CURRENCY_LIST">USD</field>',
      '      <value name="DURATION"><shadow type="math_number"><field name="NUM">' +
        o.duration +
        "</field></shadow></value>",
      '      <value name="STAKE"><shadow type="math_number"><field name="NUM">' +
        o.stake +
        "</field></shadow></value>",
      "      " + predBlock,
      "    </block>",
      "  </statement>",
      '  <statement name="CONTROLS">',
      '    <block type="profit_loss_controls">',
      '      <value name="TAKE_PROFIT"><shadow type="math_number"><field name="NUM">' +
        tp +
        "</field></shadow></value>",
      '      <value name="STOP_LOSS"><shadow type="math_number"><field name="NUM">' +
        sl +
        "</field></shadow></value>",
      "    </block>",
      "  </statement>",
      '  <statement name="PURCHASE_CONDITIONS">',
      '    <block type="purchase_conditions">',
      '      <statement name="PURCHASE_LIST">',
      '        <block type="purchase_list_item">',
      '          <field name="PURCHASE_LIST">' + o.contract + "</field>",
      "        </block>",
      "      </statement>",
      "    </block>",
      "  </statement>",
      '  <statement name="AFTER_PURCHASE">',
      '    <block type="after_purchase">',
      '      <statement name="PURCHASED_LIST">',
      '        <block type="purchased_list_item">',
      '          <field name="PURCHASED_LIST">contract_is_expired</field>',
      '          <statement name="STACK">',
      '            <block type="controls_if">',
      '              <mutation else="1"></mutation>',
      '              <value name="IF0">',
      '                <block type="check_result">',
      '                  <field name="CHECK_RESULT_CONDITION">is_win</field>',
      "                </block>",
      "              </value>",
      '              <statement name="DO0">',
      '                <block type="trade_again"></block>',
      "              </statement>",
      '              <statement name="ELSE">',
      '                <block type="martingale">',
      '                  <value name="MARTINGALE_MULTIPLIER">',
      '                    <shadow type="math_number"><field name="NUM">' +
        o.mart +
        "</field></shadow>",
      "                  </value>",
      '                  <next><block type="trade_again"></block></next>',
      "                </block>",
      "              </statement>",
      "            </block>",
      "          </statement>",
      "        </block>",
      "      </statement>",
      "    </block>",
      "  </statement>",
      "</block>",
      "</xml>",
    ].join("\n");
  }

  var TEMPLATES = [
    {
      id: "alltwb",
      name: "All TWB",
      badge: "DEFAULT",
      badgeCls: "green",
      desc: "All-direction digit trader. Bets Over on every tick with martingale recovery.",
      xml: buildXml({
        symbol: "1HZ100V",
        contract: "DIGITOVER",
        barrier: 1,
        duration: 1,
        dunit: "t",
        stake: 1,
        mart: 4.5,
        tp: 1,
        sl: 20,
      }),
    },
    {
      id: "over1sniper",
      name: "Over 1 Sniper",
      badge: "POPULAR",
      badgeCls: "blue",
      desc: "Digits greater than 1 — high frequency. Aggressive ×2.5 martingale on loss.",
      xml: buildXml({
        symbol: "1HZ100V",
        contract: "DIGITOVER",
        barrier: 1,
        duration: 1,
        dunit: "t",
        stake: 1,
        mart: 4.5,
        tp: 1,
        sl: 20,
      }),
    },
    {
      id: "under8shield",
      name: "Under 8 Shield",
      badge: "",
      badgeCls: "",
      desc: "Last digit under 8 (0–7 wins). Wide target range, lower-risk ×2 martingale.",
      xml: buildXml({
        symbol: "1HZ100V",
        contract: "DIGITUNDER",
        barrier: 8,
        duration: 1,
        dunit: "t",
        stake: 1,
        mart: 4.5,
        tp: 1,
        sl: 20,
      }),
    },
    {
      id: "differ5",
      name: "Differ 5",
      badge: "HIGH WIN%",
      badgeCls: "green",
      desc: "Last digit differs from 5 — ~90% statistical win rate. Conservative ×2.2.",
      xml: buildXml({
        symbol: "1HZ100V",
        contract: "DIGITDIFF",
        barrier: 5,
        duration: 1,
        dunit: "t",
        stake: 1,
        mart: 12.5,
        tp: 1,
        sl: 20,
      }),
    },
    {
      id: "evenodd",
      name: "Even / Odd",
      badge: "",
      badgeCls: "",
      desc: "Trades even digits on Volatility 25. Moderate risk, smooth compounding.",
      xml: buildXml({
        symbol: "1HZ25V",
        contract: "DIGITEVEN",
        barrier: 0,
        duration: 1,
        dunit: "t",
        stake: 1,
        mart: 2.2,
        tp: 1,
        sl: 20,
      }),
    },
    {
      id: "match7",
      name: "Digit Match 7",
      badge: "HIGH RISK",
      badgeCls: "red",
      desc: "Exact match on digit 7 — high payout (~9×), high risk. Use tiny stakes.",
      xml: buildXml({
        symbol: "1HZ100V",
        contract: "DIGITMATCH",
        barrier: 7,
        duration: 1,
        dunit: "t",
        stake: 0.35,
        mart: 1.2,
        tp: 1,
        sl: 20,
      }),
    },
    {
      id: "risefall",
      name: "Rise / Fall",
      badge: "",
      badgeCls: "",
      desc: "Classic CALL on Volatility 100 (1s). Trend-following with ×2.2 recovery.",
      xml: buildXml({
        symbol: "1HZ100V",
        contract: "CALL",
        barrier: 0,
        duration: 1,
        dunit: "t",
        stake: 1,
        mart: 2.2,
        tp: 1,
        sl: 20,
      }),
    },
    {
      id: "recovery",
      name: "Recovery Bot",
      badge: "",
      badgeCls: "",
      desc: "Doubles on loss and switches direction to recover. Anti-streak bias filter.",
      xml: buildXml({
        symbol: "1HZ100V",
        contract: "CALL",
        barrier: 0,
        duration: 1,
        dunit: "t",
        stake: 1,
        mart: 2.2,
        tp: 1,
        sl: 20,
      }),
    },
    {
      id: "scalper",
      name: "Conservative Scalper",
      badge: "LOW RISK",
      badgeCls: "yellow",
      desc: "Over 1 on Volatility 50 with modest ×1.8 martingale. Steady compounding.",
      xml: buildXml({
        symbol: "1HZ50V",
        contract: "DIGITOVER",
        barrier: 1,
        duration: 1,
        dunit: "t",
        stake: 0.5,
        mart: 4.5,
        tp: 1,
        sl: 20,
      }),
    },
    {
      id: "antimart",
      name: "Anti-Martingale",
      badge: "COMPOUND",
      badgeCls: "purple",
      desc: "Compounds stake on wins, resets on loss. Maximize hot streaks.",
      xml: buildXml({
        symbol: "1HZ100V",
        contract: "DIGITOVER",
        barrier: 1,
        duration: 1,
        dunit: "t",
        stake: 1,
        mart: 4.5,
        tp: 1,
        sl: 20,
      }),
    },
  ];

  /* ═══════════════════════════════════════════════════════════
     XML PARSER  — reads config directly from raw XML string
     Execution engine reads ONLY from the parsed config object.
     ═══════════════════════════════════════════════════════════ */

  function parseXml(xmlText) {
    var cfg = {
      symbol: "1HZ100V",
      contract: "CALL",
      barrier: null,
      duration: 1,
      dunit: "t",
      stake: 1,
      mart: 2.2,
      tp: 1,
      sl: 20,
      currency: "USD",
    };
    if (!xmlText) return cfg;
    try {
      var doc = new DOMParser().parseFromString(xmlText, "text/xml");
      if (doc.querySelector("parsererror")) throw new Error("XML parse error");

      /* symbol */
      var symFld = doc.querySelector(
        "block[type='trade_definition_market'] field[name='SYMBOL_LIST']",
      );
      if (symFld) cfg.symbol = symFld.textContent.trim();

      /* trade options */
      var opts = doc.querySelector(
        "block[type='trade_definition_tradeoptions']",
      );
      if (opts) {
        var dunitFld = opts.querySelector("field[name='DURATIONTYPE_LIST']");
        if (dunitFld) cfg.dunit = dunitFld.textContent.trim();

        var curFld = opts.querySelector("field[name='CURRENCY_LIST']");
        if (curFld) cfg.currency = curFld.textContent.trim();

        cfg.duration = numVal(opts, "DURATION") || 1;
        cfg.stake = numVal(opts, "STAKE") || 1;
        var pred = numVal(opts, "PREDICTION");
        if (pred !== null) cfg.barrier = pred;
      }

      /* contract type — prefer purchase_list_item, fall back to trade_definition_tradeoptions type field */
      var pli = doc.querySelector(
        "block[type='purchase_list_item'] field[name='PURCHASE_LIST']",
      );
      if (pli) {
        cfg.contract = pli.textContent.trim();
      } else {
        /* try Deriv XML that uses a different field name */
        var contractFld = doc.querySelector(
          "block[type='trade_definition_tradeoptions'] field[name='CONTRACT_TYPE']",
        );
        if (contractFld) cfg.contract = contractFld.textContent.trim();
      }

      /* martingale multiplier */
      var martBlk = doc.querySelector("block[type='martingale']");
      if (martBlk) {
        var mm = numVal(martBlk, "MARTINGALE_MULTIPLIER");
        if (mm !== null) cfg.mart = mm;
      }

      /* take profit and stop loss */
      var ctrlBlk = doc.querySelector("block[type='profit_loss_controls']");
      if (ctrlBlk) {
        var tp = numVal(ctrlBlk, "TAKE_PROFIT");
        if (tp !== null) cfg.tp = tp;
        var sl = numVal(ctrlBlk, "STOP_LOSS");
        if (sl !== null) cfg.sl = sl;
      }
    } catch (e) {
      console.warn("[DBot] parseXml error:", e.message);
    }
    return cfg;
  }

  function numVal(parentEl, valueName) {
    /* reads value from <value name="X"><(shadow|block) type="math_number"><field name="NUM">N</field>... */
    var valEl = parentEl.querySelector("value[name='" + valueName + "']");
    if (!valEl) return null;
    var numFld = valEl.querySelector("field[name='NUM']");
    if (!numFld) return null;
    var n = parseFloat(numFld.textContent.trim());
    return isNaN(n) ? null : n;
  }

  /* ═══════════════════════════════════════════════════════════
     BLOCKLY  — block definitions + workspace init
     ═══════════════════════════════════════════════════════════ */

  var workspace = null;
  var rawXml = "";
  var botConfig = null; /* last parsed config — execution reads this */

  function registerCustomBlocks() {
    if (typeof Blockly === "undefined") return;

    var C = {
      root: "#0f7a52",
      market: "#2460a7",
      options: "#3d4f9c",
      purchase: "#6b3fa0",
      after: "#a03060",
      logic: "#555566",
      action: "#0f7a52",
    };

    /* ── trade_definition (root) ──────────────────── */
    Blockly.Blocks["trade_definition"] = {
      init: function () {
        this.setColour(C.root);
        this.appendDummyInput().appendField("🤖  Trade Block");
        this.appendStatementInput("SUBMARKET").appendField("📍 Market");
        this.appendStatementInput("TRADEOPTIONS").appendField(
          "⚙️  Trade Options",
        );
        this.appendStatementInput("CONTROLS").appendField(
          "💰 Profit/Loss Controls",
        );
        this.appendStatementInput("PURCHASE_CONDITIONS").appendField(
          "🟢 Buy When",
        );
        this.appendStatementInput("AFTER_PURCHASE").appendField(
          "🔁 After Trade",
        );
        this.setTooltip("Root block — defines the complete bot strategy");
        this.setDeletable(false);
        this.setMovable(false);
      },
    };

    /* ── trade_definition_market ─────────────────── */
    Blockly.Blocks["trade_definition_market"] = {
      init: function () {
        this.setColour(C.market);
        this.appendDummyInput()
          .appendField("Market")
          .appendField(
            new Blockly.FieldDropdown([["Synthetic Index", "synthetic_index"]]),
            "MARKET_LIST",
          );
        this.appendDummyInput()
          .appendField("Submarket")
          .appendField(
            new Blockly.FieldDropdown([["Random Index", "random_index"]]),
            "SUBMARKET_LIST",
          );
        this.appendDummyInput()
          .appendField("Symbol")
          .appendField(
            new Blockly.FieldDropdown([
              ["Volatility 100 (1s)", "1HZ100V"],
              ["Volatility 75 (1s)", "1HZ75V"],
              ["Volatility 50 (1s)", "1HZ50V"],
              ["Volatility 25 (1s)", "1HZ25V"],
              ["Volatility 10 (1s)", "1HZ10V"],
              ["Volatility 100", "R_100"],
              ["Volatility 75", "R_75"],
              ["Volatility 50", "R_50"],
              ["Volatility 25", "R_25"],
              ["Volatility 10", "R_10"],
            ]),
            "SYMBOL_LIST",
          );
        this.setPreviousStatement(true, null);
        this.setNextStatement(true, null);
        this.setTooltip("Select the trading market and symbol");
      },
    };

    /* ── trade_definition_tradeoptions ───────────── */
    Blockly.Blocks["trade_definition_tradeoptions"] = {
      init: function () {
        this.setColour(C.options);
        this.appendDummyInput().appendField("Trade Options");
        this.appendDummyInput()
          .appendField("Duration type")
          .appendField(
            new Blockly.FieldDropdown([
              ["Ticks", "t"],
              ["Seconds", "s"],
              ["Minutes", "m"],
              ["Hours", "h"],
            ]),
            "DURATIONTYPE_LIST",
          );
        this.appendDummyInput()
          .appendField("Currency")
          .appendField(
            new Blockly.FieldDropdown([
              ["USD", "USD"],
              ["EUR", "EUR"],
              ["GBP", "GBP"],
              ["BTC", "BTC"],
            ]),
            "CURRENCY_LIST",
          );
        this.appendValueInput("DURATION")
          .setCheck("Number")
          .appendField("Duration");
        this.appendValueInput("STAKE").setCheck("Number").appendField("Stake");
        this.appendValueInput("PREDICTION")
          .setCheck("Number")
          .appendField("Barrier / Digit");
        this.setPreviousStatement(true, null);
        this.setNextStatement(true, null);
        this.setTooltip(
          "Set stake, duration and barrier/digit for this contract",
        );
      },
    };

    /* ── purchase_conditions ─────────────────────── */
    Blockly.Blocks["purchase_conditions"] = {
      init: function () {
        this.setColour(C.purchase);
        this.appendDummyInput().appendField("Purchase Conditions");
        this.appendStatementInput("PURCHASE_LIST").appendField("Contracts");
        this.setPreviousStatement(true, null);
        this.setNextStatement(true, null);
      },
    };

    /* ── purchase_list_item ──────────────────────── */
    Blockly.Blocks["purchase_list_item"] = {
      init: function () {
        this.setColour(C.purchase);
        this.appendDummyInput()
          .appendField("Buy")
          .appendField(
            new Blockly.FieldDropdown([
              ["Rise (Call)", "CALL"],
              ["Fall (Put)", "PUT"],
              ["Over", "DIGITOVER"],
              ["Under", "DIGITUNDER"],
              ["Differ", "DIGITDIFF"],
              ["Match", "DIGITMATCH"],
              ["Even", "DIGITEVEN"],
              ["Odd", "DIGITODD"],
              ["Touch", "ONETOUCH"],
              ["No Touch", "NOTOUCH"],
              ["Ends Between", "EXPIRYMISS"],
              ["Ends Outside", "EXPIRYRANGE"],
            ]),
            "PURCHASE_LIST",
          );
        this.setPreviousStatement(true, null);
        this.setNextStatement(true, null);
        this.setTooltip("Contract type to purchase on this trade");
      },
    };

    /* ── after_purchase ──────────────────────────── */
    Blockly.Blocks["after_purchase"] = {
      init: function () {
        this.setColour(C.after);
        this.appendDummyInput().appendField("After Purchase");
        this.appendStatementInput("PURCHASED_LIST").appendField("On event");
        this.setPreviousStatement(true, null);
        this.setNextStatement(true, null);
      },
    };

    /* ── purchased_list_item ─────────────────────── */
    Blockly.Blocks["purchased_list_item"] = {
      init: function () {
        this.setColour(C.after);
        this.appendDummyInput()
          .appendField("When")
          .appendField(
            new Blockly.FieldDropdown([
              ["Contract Expired", "contract_is_expired"],
              ["Contract Sold", "contract_is_sold"],
              ["Tick Passed", "tick_is_passed"],
            ]),
            "PURCHASED_LIST",
          );
        this.appendStatementInput("STACK").appendField("Do");
        this.setPreviousStatement(true, null);
        this.setNextStatement(true, null);
      },
    };

    /* ── check_result ───────────────────────────── */
    Blockly.Blocks["check_result"] = {
      init: function () {
        this.setColour(C.logic);
        this.appendDummyInput()
          .appendField("Result is")
          .appendField(
            new Blockly.FieldDropdown([
              ["Win", "is_win"],
              ["Loss", "is_loss"],
            ]),
            "CHECK_RESULT_CONDITION",
          );
        this.setOutput(true, "Boolean");
        this.setTooltip("True if the last contract result matches");
      },
    };

    /* ── trade_again ─────────────────────────────── */
    Blockly.Blocks["trade_again"] = {
      init: function () {
        this.setColour(C.action);
        this.appendDummyInput().appendField("🔁  Trade Again");
        this.setPreviousStatement(true, null);
        this.setNextStatement(true, null);
        this.setTooltip("Re-run the bot with current settings");
      },
    };

    /* ── martingale ──────────────────────────────── */
    Blockly.Blocks["martingale"] = {
      init: function () {
        this.setColour(C.action);
        this.appendValueInput("MARTINGALE_MULTIPLIER")
          .setCheck("Number")
          .appendField("📈  Martingale ×");
        this.setPreviousStatement(true, null);
        this.setNextStatement(true, null);
        this.setTooltip("Multiply stake by this amount after a loss");
      },
    };

    /* ── total_profit_loss ───────────────────────── */
    Blockly.Blocks["total_profit_loss"] = {
      init: function () {
        this.setColour(C.logic);
        this.appendDummyInput()
          .appendField("Total")
          .appendField(
            new Blockly.FieldDropdown([
              ["Profit/Loss", "profit"],
              ["Profit only", "profit_only"],
              ["Loss only", "loss_only"],
            ]),
            "TOTAL_TYPE",
          );
        this.setOutput(true, "Number");
        this.setTooltip("Current cumulative profit or loss");
      },
    };

    /* ── contract_details ────────────────────────── */
    Blockly.Blocks["contract_details"] = {
      init: function () {
        this.setColour(C.logic);
        this.appendDummyInput()
          .appendField("Contract")
          .appendField(
            new Blockly.FieldDropdown([
              ["Profit", "profit"],
              ["Payout", "payout"],
              ["Stake", "ask_price"],
              ["Buy Price", "buy_price"],
              ["Sell Price", "sell_price"],
              ["Entry Spot", "entry_tick"],
              ["Exit Spot", "exit_tick"],
            ]),
            "CONTRACT_DETAIL",
          );
        this.setOutput(true, "Number");
        this.setTooltip("Get a value from the last contract");
      },
    };

    /* ── last_digit_prior ────────────────────────── */
    Blockly.Blocks["last_digit_prior"] = {
      init: function () {
        this.setColour(C.logic);
        this.appendDummyInput().appendField("Last Digit of Previous Tick");
        this.setOutput(true, "Number");
      },
    };

    /* ── win_loss_count ──────────────────────────── */
    Blockly.Blocks["win_loss_count"] = {
      init: function () {
        this.setColour(C.logic);
        this.appendDummyInput()
          .appendField("Consecutive")
          .appendField(
            new Blockly.FieldDropdown([
              ["Wins", "wins"],
              ["Losses", "losses"],
            ]),
            "TYPE",
          )
          .appendField("≥")
          .appendField(new Blockly.FieldNumber(2, 1, 100, 1), "COUNT");
        this.setOutput(true, "Boolean");
      },
    };

    /* ── profit_loss_controls ───────────────────── */
    Blockly.Blocks["profit_loss_controls"] = {
      init: function () {
        this.setColour(C.logic);
        this.appendDummyInput().appendField("💰 Profit/Loss Controls");
        this.appendValueInput("TAKE_PROFIT")
          .setCheck("Number")
          .appendField("🎯 Take Profit ($)");
        this.appendValueInput("STOP_LOSS")
          .setCheck("Number")
          .appendField("🛑 Stop Loss ($)");
        this.setPreviousStatement(true, null);
        this.setNextStatement(true, null);
        this.setTooltip(
          "Set profit target and loss limit. Bot stops when either is reached.",
        );
      },
    };

    /* ── reset_balance ───────────────────────────── */
    Blockly.Blocks["reset_balance"] = {
      init: function () {
        this.setColour("#e04040");
        this.appendDummyInput().appendField("💰  Reset Demo Balance");
        this.setPreviousStatement(true, null);
        this.setNextStatement(true, null);
      },
    };

    /* ── run_again (alias) ───────────────────────── */
    Blockly.Blocks["run_again"] = {
      init: function () {
        this.setColour(C.action);
        this.appendDummyInput().appendField("▶  Run Again");
        this.setPreviousStatement(true, null);
        this.setNextStatement(true, null);
      },
    };
  }

  function buildToolbox() {
    return {
      kind: "categoryToolbox",
      contents: [
        {
          kind: "category",
          name: "📊 Trade",
          colour: "#0f7a52",
          contents: [
            { kind: "block", type: "trade_definition" },
            { kind: "block", type: "trade_definition_market" },
            { kind: "block", type: "trade_definition_tradeoptions" },
          ],
        },
        {
          kind: "category",
          name: "💰 Purchase",
          colour: "#6b3fa0",
          contents: [
            { kind: "block", type: "purchase_conditions" },
            { kind: "block", type: "purchase_list_item" },
          ],
        },
        {
          kind: "category",
          name: "🔁 After Trade",
          colour: "#a03060",
          contents: [
            { kind: "block", type: "after_purchase" },
            { kind: "block", type: "purchased_list_item" },
            { kind: "block", type: "check_result" },
            { kind: "block", type: "trade_again" },
            { kind: "block", type: "run_again" },
          ],
        },
        {
          kind: "category",
          name: "� Controls",
          colour: "#555566",
          contents: [
            { kind: "block", type: "profit_loss_controls" },
            { kind: "block", type: "martingale" },
            { kind: "block", type: "total_profit_loss" },
            { kind: "block", type: "win_loss_count" },
          ],
        },
        {
          kind: "category",
          name: "📋 Contract",
          colour: "#555566",
          contents: [
            { kind: "block", type: "contract_details" },
            { kind: "block", type: "last_digit_prior" },
          ],
        },
        {
          kind: "category",
          name: "⚡ Logic",
          colour: "#5b80a5",
          contents: [
            { kind: "block", type: "controls_if" },
            { kind: "block", type: "math_number" },
            { kind: "block", type: "math_arithmetic" },
            { kind: "block", type: "variables_get" },
            { kind: "block", type: "variables_set" },
            { kind: "block", type: "logic_compare" },
            { kind: "block", type: "logic_operation" },
          ],
        },
      ],
    };
  }

  /* ── Blockly 10 compatibility shims ────────────────────────────── */
  function blkTextToDom(xmlText) {
    /* Blockly 10 moved textToDom to Blockly.utils.xml */
    if (
      Blockly.utils &&
      Blockly.utils.xml &&
      typeof Blockly.utils.xml.textToDom === "function"
    ) {
      return Blockly.utils.xml.textToDom(xmlText);
    }
    /* Blockly <10 fallback */
    if (Blockly.Xml && typeof Blockly.Xml.textToDom === "function") {
      return Blockly.Xml.textToDom(xmlText);
    }
    /* last resort: DOMParser */
    var doc = new DOMParser().parseFromString(xmlText, "text/xml");
    if (doc.querySelector("parsererror")) throw new Error("XML parse error");
    return doc.documentElement;
  }

  function blkWorkspaceToDom(ws) {
    return Blockly.Xml.workspaceToDom(ws);
  }

  function blkDomToText(dom) {
    return Blockly.Xml.domToText(dom);
  }

  function blkDomToWorkspace(dom, ws) {
    return Blockly.Xml.domToWorkspace(dom, ws);
  }

  function blkSvgResize(ws) {
    /* Blockly 10 prefers workspace.resize() */
    if (ws && typeof ws.resize === "function") {
      try {
        ws.resize();
      } catch (e) {
        console.warn("[DBot] workspace.resize() failed:", e);
      }
      return;
    }
    if (typeof Blockly.svgResize === "function") {
      try {
        Blockly.svgResize(ws);
      } catch (e) {
        console.warn("[DBot] Blockly.svgResize() failed:", e);
      }
    }
  }

  function ensureBlocklyDivSize() {
    /* Ensure the blockly container has proper dimensions */
    var el = $("blockly-div");
    if (!el) return false;
    var wrap = el.parentElement;
    if (!wrap) return false;

    var wrapHeight = wrap.offsetHeight;
    var wrapWidth = wrap.offsetWidth;

    if (wrapHeight <= 0 || wrapWidth <= 0) {
      console.warn("[DBot] blockly-wrap has invalid dimensions:", wrapWidth, "x", wrapHeight);
      return false;
    }

    /* Ensure blockly-div fills its container */
    el.style.width = "100%";
    el.style.height = "100%";
    el.style.position = "absolute";
    el.style.top = "0";
    el.style.left = "0";

    console.log("[DBot] blockly container sized:", wrapWidth, "x", wrapHeight);
    return true;
  }

  function initWorkspace() {
    if (typeof Blockly === "undefined") {
      log("Blockly library not available — check CDN connection", "warn");
      return false;
    }
    if (workspace) {
      console.log("[DBot] workspace already initialized");
      return true;
    }
    registerCustomBlocks();

    var el = $("blockly-div");
    if (!el) {
      console.warn("[DBot] blockly-div element not found");
      return false;
    }

    /* Ensure container has proper size before injection */
    if (!ensureBlocklyDivSize()) {
      console.warn("[DBot] blockly container size check failed");
      return false;
    }

    var dark = !document.body.classList.contains("light-theme");

    var theme;
    try {
      theme = Blockly.Theme.defineTheme("autonixTheme", {
        base: Blockly.Themes.Classic,
        componentStyles: {
          workspaceBackgroundColour: dark ? "#08081a" : "#f4f4f8",
          toolboxBackgroundColour: dark ? "#10101e" : "#ffffff",
          toolboxForegroundColour: dark ? "#cccccc" : "#333333",
          flyoutBackgroundColour: dark ? "#14141f" : "#f8f8ff",
          flyoutForegroundColour: dark ? "#cccccc" : "#333333",
          flyoutOpacity: 0.97,
          scrollbarColour: dark ? "#333344" : "#cccccc",
          scrollbarOpacity: 0.6,
        },
      });
    } catch (e) {
      theme = undefined;
    }

    try {
      workspace = Blockly.inject(el, {
        toolbox: buildToolbox(),
        theme: theme,
        grid: {
          spacing: 22,
          length: 3,
          colour: dark ? "#111122" : "#e4e4ec",
          snap: true,
        },
        zoom: {
          controls: true,
          wheel: true,
          startScale: 0.85,
          maxScale: 2.5,
          minScale: 0.3,
          scaleSpeed: 1.2,
        },
        trashcan: true,
        scrollbars: true,
        sounds: false,
        move: { scrollbars: true, drag: true, wheel: true },
      });
      console.log("[DBot] workspace injected successfully");
    } catch (e) {
      console.error("[DBot] workspace injection failed:", e);
      workspace = null;
      return false;
    }
    
    if (!workspace) {
      console.warn("[DBot] workspace is null after injection");
      return false;
    }

    var debounceId = null;
    workspace.addChangeListener(function () {
      clearTimeout(debounceId);
      debounceId = setTimeout(onWorkspaceChanged, 250);
    });

    /* Force initial resize */
    setTimeout(function () {
      blkSvgResize(workspace);
    }, 50);

    /* Auto-load any pending XML into a newly-created workspace */
    if (rawXml) {
      try {
        console.log("[DBot] auto-loading pending XML");
        var dom = blkTextToDom(rawXml);
        blkDomToWorkspace(dom, workspace);
        botConfig = parseXml(rawXml);
        renderInfoBar(botConfig);
        var empty = $("dbot-empty");
        if (empty) empty.style.display = "none";
        setTimeout(function () {
          blkSvgResize(workspace);
          if (workspace && typeof workspace.scrollCenter === "function") {
            workspace.scrollCenter();
          }
        }, 80);
      } catch (e) {
        console.warn("[DBot] auto-load xml failed:", e);
      }
    }

    console.log("[DBot] workspace initialization complete");
    return true;
  }

  function onWorkspaceChanged() {
    if (!workspace) return;
    var dom = blkWorkspaceToDom(workspace);
    var xmlText = blkDomToText(dom);
    rawXml = xmlText;

    var blocks = workspace.getAllBlocks(false).length;
    var info = $("dbot-wsinfo");
    if (info) info.textContent = blocks + " block" + (blocks !== 1 ? "s" : "");

    /* re-parse config from the live workspace XML */
    botConfig = parseXml(rawXml);
    renderInfoBar(botConfig);
  }

  /* ═══════════════════════════════════════════════════════════
     TEMPLATE LIBRARY  — render + load
     ═══════════════════════════════════════════════════════════ */

  var activeTemplateId = null;

  function renderLibrary() {
    var list = $("dbot-lib-list");
    if (!list) return;
    list.innerHTML = TEMPLATES.map(function (tpl) {
      return [
        '<div class="dbot-tpl' +
          (tpl.id === activeTemplateId ? " active" : "") +
          '" data-id="' +
          tpl.id +
          '">',
        '  <div class="dbot-tpl-top">',
        '    <span class="dbot-tpl-name">' + tpl.name + "</span>",
        tpl.badge
          ? '    <span class="dbot-tpl-badge ' +
            tpl.badgeCls +
            '">' +
            tpl.badge +
            "</span>"
          : "",
        "  </div>",
        '  <div class="dbot-tpl-desc">' + tpl.desc + "</div>",
        '  <button class="dbot-tpl-load" data-load="' +
          tpl.id +
          '" type="button">▶ Load</button>',
        "</div>",
      ].join("");
    }).join("");

    list.querySelectorAll("[data-load]").forEach(function (btn) {
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        loadTemplate(btn.getAttribute("data-load"));
      });
    });
    list.querySelectorAll(".dbot-tpl").forEach(function (item) {
      item.addEventListener("click", function () {
        loadTemplate(item.getAttribute("data-id"));
      });
    });
  }

  function loadTemplate(id, attempts) {
    attempts = typeof attempts === "undefined" ? 6 : attempts;
    var tpl = TEMPLATES.find(function (t) {
      return t.id === id;
    });
    if (!tpl) return;
    activeTemplateId = id;

    /* If workspace is not initialized, try to create it on-demand */
    if (!workspace) {
      if (typeof Blockly !== "undefined") {
        var inited = initWorkspace();
        if (!inited) {
          if (attempts > 0) {
            setTimeout(function () {
              loadTemplate(id, attempts - 1);
            }, 300);
            return;
          }
          /* final fallback: show parsed bot info even without a workspace */
          rawXml = tpl.xml;
          botConfig = parseXml(rawXml);
          renderInfoBar(botConfig);
          var empty = $("dbot-empty");
          if (empty) empty.style.display = "none";
          var nameInput = $("dbot-bot-name");
          if (nameInput && tpl.name) nameInput.value = tpl.name;
          renderLibrary();
          document.querySelectorAll(".dbot-tpl").forEach(function (el) {
            el.classList.toggle("active", el.getAttribute("data-id") === id);
          });
          switchTab("builder");
          log("Loaded: " + tpl.name + " (workspace not ready)", "info");
          return;
        }
      } else {
        /* Blockly not available — try to load it dynamically, else fallback */
        ensureBlocklyLoaded().then(function (loaded) {
          if (loaded) {
            setTimeout(function () {
              loadTemplate(id, attempts - 1);
            }, 250);
            return;
          }
          rawXml = tpl.xml;
          botConfig = parseXml(rawXml);
          renderInfoBar(botConfig);
          var empty2 = $("dbot-empty");
          if (empty2) empty2.style.display = "none";
          var nameInput2 = $("dbot-bot-name");
          if (nameInput2 && tpl.name) nameInput2.value = tpl.name;
          renderLibrary();
          document.querySelectorAll(".dbot-tpl").forEach(function (el) {
            el.classList.toggle("active", el.getAttribute("data-id") === id);
          });
          switchTab("builder");
          log("Loaded: " + tpl.name + " (Blockly not available)", "info");
        });
        return;
      }
    }

    var ok = loadXmlIntoWorkspace(tpl.xml, tpl.name);
    if (ok) {
      /* update active state in list */
      document.querySelectorAll(".dbot-tpl").forEach(function (el) {
        el.classList.toggle("active", el.getAttribute("data-id") === id);
      });
      /* on mobile, switch to builder tab after loading */
      switchTab("builder");
    }
  }

  function loadXmlIntoWorkspace(xmlText, name) {
    if (!workspace) {
      /* Try to initialize workspace now if Blockly is present */
      if (typeof Blockly !== "undefined") {
        var okInit = initWorkspace();
        if (!okInit) {
          /* Fallback: still parse XML and show info bar so bot can run without visual blocks */
          rawXml = xmlText;
          botConfig = parseXml(xmlText);
          renderInfoBar(botConfig);
          var empty = $("dbot-empty");
          if (empty) empty.style.display = "none";
          var nameInput = $("dbot-bot-name");
          if (nameInput && name) nameInput.value = name;
          log("Loaded: " + (name || "bot") + " — " + contractLabel(botConfig) + " (workspace init failed)", "warn");
          console.log("[DBot] Falling back to info bar display");
          return true;
        }
      } else {
        rawXml = xmlText;
        botConfig = parseXml(xmlText);
        renderInfoBar(botConfig);
        var empty = $("dbot-empty");
        if (empty) empty.style.display = "none";
        var nameInput = $("dbot-bot-name");
        if (nameInput && name) nameInput.value = name;
        log("Loaded: " + (name || "bot") + " — " + contractLabel(botConfig) + " (Blockly not available)", "info");
        return true;
      }
    }
    try {
      console.log("[DBot] clearing and loading XML for:", name);
      workspace.clear();
      
      var dom = blkTextToDom(xmlText);
      console.log("[DBot] XML parsed, loading into workspace");
      blkDomToWorkspace(dom, workspace);
      
      rawXml = xmlText;
      botConfig = parseXml(xmlText);
      renderInfoBar(botConfig);
      
      console.log("[DBot] XML loaded, checking block count");
      var blocks = workspace.getAllBlocks(false).length;
      console.log("[DBot] blocks in workspace:", blocks);

      /* hide empty state */
      var empty = $("dbot-empty");
      if (empty) empty.style.display = "none";

      /* set bot name */
      var nameInput = $("dbot-bot-name");
      if (nameInput && name) nameInput.value = name;

      /* Force workspace resize with multiple attempts to ensure SVG renders */
      console.log("[DBot] triggering workspace resize and center");
      
      setTimeout(function () {
        console.log("[DBot] resize attempt 1");
        blkSvgResize(workspace);
      }, 0);
      
      setTimeout(function () {
        console.log("[DBot] resize attempt 2");
        blkSvgResize(workspace);
        if (workspace && typeof workspace.scrollCenter === "function") {
          workspace.scrollCenter();
        }
      }, 50);
      
      setTimeout(function () {
        console.log("[DBot] resize attempt 3");
        blkSvgResize(workspace);
      }, 100);

      log(
        "Loaded: " + (name || "bot") + " — " + contractLabel(botConfig) + " (" + blocks + " blocks)",
        "info",
      );
      return true;
    } catch (e) {
      log("Failed to load XML: " + e.message, "warn");
      console.error("[DBot] loadXml error:", e);
      console.error("[DBot] stack:", e.stack);
      return false;
    }
  }

  /* ═══════════════════════════════════════════════════════════
     INFO BAR  — shows parsed config as read-only chips
     ═══════════════════════════════════════════════════════════ */

  var SYM_LABELS = {
    "1HZ100V": "Vol 100 (1s)",
    "1HZ75V": "Vol 75 (1s)",
    "1HZ50V": "Vol 50 (1s)",
    "1HZ25V": "Vol 25 (1s)",
    "1HZ10V": "Vol 10 (1s)",
    R_100: "Volatility 100",
    R_75: "Volatility 75",
    R_50: "Volatility 50",
    R_25: "Volatility 25",
    R_10: "Volatility 10",
  };
  var CONTRACT_LABELS = {
    CALL: "Rise",
    PUT: "Fall",
    DIGITOVER: "Over",
    DIGITUNDER: "Under",
    DIGITDIFF: "Differ",
    DIGITMATCH: "Match",
    DIGITEVEN: "Even",
    DIGITODD: "Odd",
    ONETOUCH: "Touch",
    NOTOUCH: "No Touch",
  };
  var DUNIT_LABELS = { t: "tick", s: "sec", m: "min", h: "hr", d: "day" };

  function contractLabel(cfg) {
    if (!cfg) return "";
    var lbl = CONTRACT_LABELS[cfg.contract] || cfg.contract;
    if (
      /^DIGIT(OVER|UNDER|DIFF|MATCH)$/.test(cfg.contract) &&
      cfg.barrier !== null
    ) {
      lbl += " " + cfg.barrier;
    }
    return lbl;
  }

  function renderInfoBar(cfg) {
    var bar = $("dbot-info-bar");
    if (!bar) return;
    if (!cfg) {
      bar.innerHTML =
        '<span class="dbot-info-empty">No bot loaded — select a template or import XML</span>';
      return;
    }
    var du = DUNIT_LABELS[cfg.dunit] || cfg.dunit;
    var hasPred =
      /^DIGIT(OVER|UNDER|DIFF|MATCH)$/.test(cfg.contract) &&
      cfg.barrier !== null;
    var chips = [
      chip("📍 " + (SYM_LABELS[cfg.symbol] || cfg.symbol), "blue"),
      chip("📋 " + (CONTRACT_LABELS[cfg.contract] || cfg.contract), "green"),
      hasPred ? chip("Digit " + cfg.barrier, "") : "",
      chip("⏱ " + cfg.duration + " " + du, ""),
      chip("💵 $" + (+cfg.stake).toFixed(2), "green"),
      chip("📈 ×" + cfg.mart, "yellow"),
      cfg.tp > 0 ? chip("🎯 TP $" + cfg.tp, "green") : "",
      cfg.sl > 0 ? chip("🛑 SL $" + cfg.sl, "red") : "",
    ]
      .filter(Boolean)
      .join("");
    bar.innerHTML = chips;
  }

  function chip(text, cls) {
    return (
      '<span class="dbot-chip' +
      (cls ? " " + cls : "") +
      '">' +
      text +
      "</span>"
    );
  }

  /* ═══════════════════════════════════════════════════════════
     EXECUTION ENGINE
     All trade parameters come from botConfig (parsed XML).
     The only external controls are Run / Stop buttons.
     ═══════════════════════════════════════════════════════════ */

  var botRunning = false;
  var botState = {
    trades: 0,
    wins: 0,
    losses: 0,
    pl: 0,
    totalProfit: 0,
    totalLoss: 0,
    currentStake: 0,
    martStep: 0,
    maxDrawdown: 0,
    peakPl: 0,
    bestWinStreak: 0,
    curWinStreak: 0,
    consecLoss: 0,
    tpReached: false,
    slReached: false,
  };

  function resetBotState() {
    Object.assign(botState, {
      trades: 0,
      wins: 0,
      losses: 0,
      pl: 0,
      totalProfit: 0,
      totalLoss: 0,
      currentStake: botConfig ? +botConfig.stake : 0,
      martStep: 0,
      maxDrawdown: 0,
      peakPl: 0,
      bestWinStreak: 0,
      curWinStreak: 0,
      consecLoss: 0,
      tpReached: false,
      slReached: false,
    });
    updateStats();
  }

  function setRunning(on) {
    botRunning = on;
    var pill = $("dbot-status-pill");
    var txt = $("dbot-status-txt");
    var start = $("dbot-start-btn");
    var stop = $("dbot-stop-btn");
    if (pill) pill.className = "dbot-status-pill" + (on ? " running" : "");
    if (txt) txt.textContent = on ? "Running" : "Stopped";
    if (start) start.disabled = on;
    if (stop) stop.disabled = !on;
  }

  function updateStats() {
    var pl = botState.pl;
    var el = $("dstat-pl");
    if (el) {
      el.textContent = fmtPL(pl);
      el.className =
        "dbot-stat-val" + (pl > 0 ? " green" : pl < 0 ? " red" : "");
    }
    set("dstat-trades", botState.trades);
    set("dstat-wins", botState.wins);
    set("dstat-losses", botState.losses);
    set("dstat-consec", botState.consecLoss);
    set("dstat-dd", fmtUSD(botState.maxDrawdown));
    set("dstat-streak", botState.bestWinStreak + "W");
    set("dstat-tprofit", fmtUSD(botState.totalProfit));
    set("dstat-tloss", fmtUSD(botState.totalLoss));

    var stakeEl = $("dstat-stake");
    if (stakeEl)
      stakeEl.textContent = botState.currentStake
        ? fmtUSD(botState.currentStake)
        : "—";

    var wr =
      botState.trades > 0
        ? ((botState.wins / botState.trades) * 100).toFixed(1) + "%"
        : "—";
    set("dstat-wr", wr);
  }

  function set(id, val) {
    var el = $(id);
    if (el) el.textContent = val;
  }

  /* WebSocket helpers */
  function ws() {
    return window.DerivWS && window.DerivWS.getState
      ? window.DerivWS.getState().ws
      : null;
  }
  function isConnected() {
    var s = ws();
    return !!(
      s &&
      s.readyState === WebSocket.OPEN &&
      window.DerivWS &&
      window.DerivWS.isAuthorized &&
      window.DerivWS.isAuthorized()
    );
  }

  /* ── Convert contract type to tradeType/selection ────────────────── */
  function contractTypeToTradeParams(contractType, barrier) {
    var map = {
      "CALL":        { tradeType: "rise-fall", selection: "rise" },
      "PUT":         { tradeType: "rise-fall", selection: "fall" },
      "DIGITEVEN":   { tradeType: "even-odd", selection: "even" },
      "DIGITODD":    { tradeType: "even-odd", selection: "odd" },
      "DIGITMATCH":  { tradeType: "match-differ", selection: "match" },
      "DIGITDIFF":   { tradeType: "match-differ", selection: "differ" },
      "DIGITOVER":   { tradeType: "over-under", selection: "over" },
      "DIGITUNDER":  { tradeType: "over-under", selection: "under" },
    };
    var result = map[contractType];
    if (!result) throw new Error("Unknown contract type: " + contractType);
    /* For digit contracts, include the barrier/digit */
    if (barrier !== null && !isNaN(+barrier)) {
      result.digit = +barrier;
    }
    return result;
  }

  /* ── Use window.DerivWS.buyContract (proper API) ────────────────── */
  function buyContractWithDerivWS(cfg, stake) {
    if (!window.DerivWS || !window.DerivWS.buyContract) {
      return Promise.reject(new Error("DerivWS not available"));
    }

    /* Convert contract type to tradeType and selection */
    var tradeParams = contractTypeToTradeParams(cfg.contract, cfg.barrier);

    /* Prepare options for window.DerivWS.buyContract */
    var opts = {
      tradeType: tradeParams.tradeType,
      selection: tradeParams.selection,
      stake: +stake,
      duration: +cfg.duration,
      symbol: cfg.symbol,
      currency: cfg.currency || "USD",
    };

    /* Add digit if present (for digit contracts) */
    if (tradeParams.digit !== undefined) {
      opts.digit = tradeParams.digit;
    }

    /* Call the proper API which handles legacy vs new accounts */
    return new Promise(function (resolve, reject) {
      window.DerivWS.buyContract(opts, function (result) {
        /* onSettle callback — called when contract expires */
        resolve({
          contract_id: result.contractId,
          profit: result.pl,
          buy_price: result.buyPrice,
          is_sold: true,
          is_expired: true,
        });
      }).catch(function (err) {
        reject(err);
      });
    });
  }

  function waitContract(contractId) {
    /* Contract settlement is now handled by the buyContractWithDerivWS callback */
    /* This function is kept for compatibility but buyContractWithDerivWS returns
       the settlement result directly via the promise */
    return Promise.resolve({}); /* placeholder */
  }

  async function runCycle() {
    if (!botRunning) return;
    var cfg = botConfig;
    if (!cfg) {
      stopBot("No bot loaded");
      return;
    }

    if (!isConnected()) {
      stopBot("Connection lost");
      return;
    }

    var stake = botState.currentStake;

    log(
      "Placing " +
        contractLabel(cfg) +
        " @ " +
        fmtUSD(stake) +
        " on " +
        (SYM_LABELS[cfg.symbol] || cfg.symbol),
    );

    try {
      var buy = await buyContractWithDerivWS(cfg, stake);
      log(
        "Contract open @ " + fmtUSD(buy.buy_price || stake),
        "info",
      );

      var gain = parseFloat(buy.profit) || 0;
      var won = gain > 0;

      botState.trades++;
      botState.pl += gain;

      if (won) {
        botState.wins++;
        botState.totalProfit += gain;
        botState.consecLoss = 0;
        botState.curWinStreak++;
        if (botState.curWinStreak > botState.bestWinStreak)
          botState.bestWinStreak = botState.curWinStreak;
        botState.martStep = 0;
        botState.currentStake = +cfg.stake;
        dbotPlayWin();
        log(
          "WIN  +" + fmtUSD(gain) + "  |  Session: " + fmtPL(botState.pl),
          "win",
        );
      } else {
        botState.losses++;
        botState.totalLoss += Math.abs(gain);
        dbotPlayLoss();
        botState.curWinStreak = 0;
        botState.consecLoss++;
        botState.martStep++;
        botState.currentStake = parseFloat((stake * cfg.mart).toFixed(2));
        if (botState.pl < botState.peakPl) {
          var dd = botState.peakPl - botState.pl;
          if (dd > botState.maxDrawdown) botState.maxDrawdown = dd;
        }
        log(
          "LOSS " +
            fmtPL(gain) +
            "  |  Next: " +
            fmtUSD(botState.currentStake) +
            " (step " +
            botState.martStep +
            ")",
          "loss",
        );
      }
      if (botState.pl > botState.peakPl) botState.peakPl = botState.pl;

      updateStats();

      /* Check Take Profit */
      if (botState.pl >= cfg.tp) {
        botState.tpReached = true;
        if (window.showTPCelebration) {
          window.showTPCelebration(botState.pl);
        }
        stopBot("Take Profit reached: " + fmtPL(botState.pl));
        return;
      }

      /* Check Stop Loss */
      if (botState.pl <= -cfg.sl) {
        botState.slReached = true;
        stopBot("Stop Loss reached: " + fmtPL(botState.pl));
        return;
      }

      if (botRunning) setTimeout(runCycle, 300);
    } catch (e) {
      log("Error: " + e.message, "warn");
      if (botRunning) setTimeout(runCycle, 2500);
    }
  }

  function startBot() {
    if (botRunning) return;
    if (!botConfig) {
      showToast("Load a bot first", "red");
      log("No bot loaded — select a template or import XML", "warn");
      return;
    }
    if (!isConnected()) {
      showToast("Log in to Deriv first", "red");
      log("Not connected — please log in to Deriv", "warn");
      return;
    }
    resetBotState();
    setRunning(true);
    log(
      "▶ Bot started — " +
        contractLabel(botConfig) +
        " | Stake: " +
        fmtUSD(botConfig.stake) +
        " | Mart: ×" +
        botConfig.mart,
      "info",
    );
    runCycle();
    /* switch to execution panel on mobile */
    switchTab("execution");
  }

  function stopBot(reason) {
    if (!botRunning) return;
    setRunning(false);
    log(
      "■ Stopped — " + (reason || "Manual stop"),
      reason && reason !== "Manual stop" ? "warn" : "",
    );
  }

  /* ═══════════════════════════════════════════════════════════
     SAVE / EXPORT
     ═══════════════════════════════════════════════════════════ */

  function saveBot() {
    if (!rawXml) {
      log("Nothing to save", "warn");
      return;
    }
    var name = ($("dbot-bot-name") || {}).value || "mybot";
    try {
      var store = JSON.parse(localStorage.getItem("autonix_bots") || "{}");
      store[name] = { name: name, xml: rawXml, saved: Date.now() };
      localStorage.setItem("autonix_bots", JSON.stringify(store));
      showToast("Saved: " + name, "green");
      log('Saved "' + name + '" to browser storage', "info");
    } catch (e) {
      log("Save failed: " + e.message, "warn");
    }
  }

  function exportXml() {
    var xml = rawXml;
    if (!xml && workspace) {
      var dom = blkWorkspaceToDom(workspace);
      xml = blkDomToText(dom);
    }
    if (!xml) {
      log("Nothing to export", "warn");
      return;
    }
    var name = (($("dbot-bot-name") || {}).value || "mybot").replace(
      /\s+/g,
      "_",
    );
    var blob = new Blob([xml], { type: "application/xml" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = name + ".xml";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    log("Exported: " + a.download, "info");
  }

  /* ═══════════════════════════════════════════════════════════
     JOURNAL
     ═══════════════════════════════════════════════════════════ */

  function log(msg, type) {
    var j = $("dbot-journal");
    if (!j) return;
    var row = document.createElement("div");
    row.className = "dbot-log" + (type ? " " + type : "");
    row.innerHTML =
      '<span class="dbot-log-t">' +
      now() +
      "</span>" +
      '<span class="dbot-log-m">' +
      escHtml(msg) +
      "</span>";
    j.appendChild(row);
    j.scrollTop = j.scrollHeight;
  }

  function escHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /* ═══════════════════════════════════════════════════════════
     MOBILE TABS
     ═══════════════════════════════════════════════════════════ */

  var currentTab = "builder";

  function switchTab(tab) {
    var root = $("dbot-root");
    if (!root) return;
    /* only switch on mobile */
    if (window.innerWidth > 640) return;
    currentTab = tab;
    root.setAttribute("data-tab", tab);
    document.querySelectorAll(".dbot-tab-btn").forEach(function (btn) {
      btn.classList.toggle("active", btn.getAttribute("data-tab") === tab);
    });
    /* resize Blockly after showing workspace */
    if (tab === "builder" && workspace) {
      setTimeout(function () {
        blkSvgResize(workspace);
      }, 50);
    }
  }

  /* ═══════════════════════════════════════════════════════════
     LIBRARY OVERLAY (tablet toggle)
     ═══════════════════════════════════════════════════════════ */

  var libOpen = false;

  function toggleLibrary() {
    var lib = $("dbot-library");
    if (!lib) return;
    libOpen = !libOpen;
    if (libOpen) {
      lib.classList.add("overlay-open");
      /* backdrop */
      var bd = document.createElement("div");
      bd.className = "dbot-lib-overlay";
      bd.id = "dbot-lib-bd";
      bd.addEventListener("click", toggleLibrary);
      document.body.appendChild(bd);
      setTimeout(function () {
        if (bd) bd.style.display = "block";
      }, 10);
    } else {
      lib.classList.remove("overlay-open");
      var bd2 = $("dbot-lib-bd");
      if (bd2) bd2.parentNode.removeChild(bd2);
    }
  }

  /* ═══════════════════════════════════════════════════════════
     TOAST helper
     ═══════════════════════════════════════════════════════════ */

  function showToast(msg, color, dur) {
    if (window.showToast) {
      window.showToast(msg, color, dur || 2800);
      return;
    }
  }

  /* ═══════════════════════════════════════════════════════════
     BOOT
     ═══════════════════════════════════════════════════════════ */

  /* ═══════════════════════════════════════════════════════════
     TRADING SOUNDS (DBot)
     ═══════════════════════════════════════════════════════════ */
  var _dbotAudioCtx = null;
  function _dbotGetCtx() {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!_dbotAudioCtx) {
      try { _dbotAudioCtx = new AC(); } catch(e) { return null; }
    }
    if (_dbotAudioCtx.state === "suspended") {
      try { _dbotAudioCtx.resume(); } catch(e) {}
    }
    return _dbotAudioCtx;
  }
  function dbotPlayWin() {
    if (window.AutonixSounds && window.AutonixSounds.play) {
      window.AutonixSounds.play("win");
      return;
    }
    var soundsOff = localStorage.getItem("at_sounds") === "0";
    if (soundsOff) return;
    var ctx = _dbotGetCtx();
    if (!ctx) return;
    try {
      var t = ctx.currentTime;
      var osc = ctx.createOscillator(); var gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.setValueAtTime(523.25, t);
      osc.frequency.setValueAtTime(659.25, t + 0.08);
      osc.frequency.setValueAtTime(783.99, t + 0.18);
      gain.gain.setValueAtTime(0.0, t);
      gain.gain.linearRampToValueAtTime(0.28, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.65);
      osc.start(t); osc.stop(t + 0.65);
    } catch(e) {}
  }
  function dbotPlayLoss() {
    if (window.AutonixSounds && window.AutonixSounds.play) {
      window.AutonixSounds.play("loss");
      return;
    }
    var soundsOff = localStorage.getItem("at_sounds") === "0";
    if (soundsOff) return;
    var ctx = _dbotGetCtx();
    if (!ctx) return;
    try {
      var t = ctx.currentTime;
      var osc = ctx.createOscillator(); var gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(330, t);
      osc.frequency.linearRampToValueAtTime(200, t + 0.4);
      gain.gain.setValueAtTime(0.0, t);
      gain.gain.linearRampToValueAtTime(0.22, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
      osc.start(t); osc.stop(t + 0.55);
    } catch(e) {}
  }
  document.addEventListener("click", function _unlockDbotAudio() {
    _dbotGetCtx();
    document.removeEventListener("click", _unlockDbotAudio);
  }, { once: true });

  document.addEventListener("DOMContentLoaded", function () {
    /* ── init Blockly with retry ───────────────────────────────── */
    function applyDefaultTemplate() {
      var tpl = TEMPLATES.find(function (t) {
        return t.id === "alltwb";
      });
      if (!tpl) return;
      activeTemplateId = tpl.id;
      renderLibrary();
      document.querySelectorAll(".dbot-tpl").forEach(function (el) {
        el.classList.toggle("active", el.getAttribute("data-id") === tpl.id);
      });

      if (workspace) {
        loadTemplate(tpl.id);
        return;
      }

      /* Workspace not available — populate info bar and name as a fallback */
      rawXml = tpl.xml;
      botConfig = parseXml(rawXml);
      renderInfoBar(botConfig);
      var empty = $("dbot-empty");
      if (empty) empty.style.display = "none";
      var nameInput = $("dbot-bot-name");
      if (nameInput && tpl.name) nameInput.value = tpl.name;
      log("Default bot loaded: " + tpl.name + " (workspace not ready)", "info");
    }

    function tryInitWorkspace(attempts) {
      if (typeof Blockly === "undefined") {
        if (attempts > 0) {
          setTimeout(function () {
            tryInitWorkspace(attempts - 1);
          }, 500);
        } else {
          log("Blockly library not available — check CDN connection", "warn");
          /* render library and load default template as graceful fallback */
          renderLibrary();
          applyDefaultTemplate();
        }
        return;
      }
      var ok = initWorkspace();
      if (!ok) {
        if (attempts > 0) {
          setTimeout(function () {
            tryInitWorkspace(attempts - 1);
          }, 300);
        } else {
          log("Blockly workspace failed to initialize", "warn");
          renderLibrary();
          applyDefaultTemplate();
        }
        return;
      }

      console.log("[DBot] workspace initialization successful, rendering library");
      /* render template library */
      renderLibrary();

      /* Force resize AFTER layout is painted, then load default template */
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          if (workspace) {
            console.log("[DBot] initial resize before loading alltwb");
            blkSvgResize(workspace);
            /* Auto-load first template after resize so blocks have space */
            setTimeout(function () {
              console.log("[DBot] loading alltwb template");
              loadTemplate("alltwb");
            }, 80);
          } else {
            console.warn("[DBot] workspace is null after init!");
          }
        });
      });
    }

    console.log("[DBot] starting tryInitWorkspace...");
    tryInitWorkspace(6);

    /* Fall-through library render (non-Blockly UI still works if init fails) */
    if (typeof Blockly !== "undefined") {
      /* already handled inside tryInitWorkspace */
    } else {
      renderLibrary();
    }

    /* Run / Stop */
    var startBtn = $("dbot-start-btn");
    var stopBtn = $("dbot-stop-btn");
    if (startBtn) startBtn.addEventListener("click", startBot);
    if (stopBtn)
      stopBtn.addEventListener("click", function () {
        stopBot("Manual stop");
      });

    /* Save / Export */
    var saveBtn = $("dbot-save-btn");
    var expBtn = $("dbot-export-btn");
    if (saveBtn) saveBtn.addEventListener("click", saveBot);
    if (expBtn) expBtn.addEventListener("click", exportXml);

    /* Clear workspace */
    var clrBtn = $("dbot-clear-btn");
    if (clrBtn)
      clrBtn.addEventListener("click", function () {
        if (!workspace) return;
        workspace.clear();
        rawXml = "";
        botConfig = null;
        activeTemplateId = null;
        renderLibrary();
        renderInfoBar(null);
        var empty = $("dbot-empty");
        if (empty) empty.style.display = "";
        var info = $("dbot-wsinfo");
        if (info) info.textContent = "";
        log("Workspace cleared", "info");
      });

    /* Import XML */
    var importBtn = $("dbot-import-btn");
    var fileIn = $("dbot-xml-file");
    if (importBtn && fileIn) {
      importBtn.addEventListener("click", function () {
        fileIn.click();
      });
      fileIn.addEventListener("change", function () {
        var file = fileIn.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function (e) {
          var xmlText = e.target.result;
          /* Validate: must have an <xml> root */
          if (!xmlText.includes("<xml") && !xmlText.includes("<XML")) {
            showToast(
              "Invalid file — does not look like a Deriv DBot XML",
              "red",
            );
            log("Import failed: not valid XML", "warn");
            fileIn.value = "";
            return;
          }
          activeTemplateId = null;
          renderLibrary();
          var ok = loadXmlIntoWorkspace(
            xmlText,
            file.name.replace(/\.xml$/i, ""),
          );
          if (ok) {
            showToast("Bot imported: " + file.name, "green");
          } else {
            showToast("Import failed — check the XML format", "red");
          }
          fileIn.value = "";
        };
        reader.readAsText(file);
      });
    }

    /* Clear journal */
    var clrJ = $("dbot-clr-journal");
    if (clrJ)
      clrJ.addEventListener("click", function () {
        var j = $("dbot-journal");
        if (j) j.innerHTML = "";
      });

    /* Mobile tabs */
    document.querySelectorAll(".dbot-tab-btn").forEach(function (btn) {
      btn.addEventListener("click", function () {
        switchTab(btn.getAttribute("data-tab"));
      });
    });

    /* Library toggle (tablet) */
    var libToggle = $("dbot-lib-toggle");
    if (libToggle) libToggle.addEventListener("click", toggleLibrary);

    /* Resize Blockly when window resizes */
    window.addEventListener("resize", function () {
      if (workspace) blkSvgResize(workspace);
    });

    /* DerivWS hook */
    if (window.DerivWS && window.DerivWS.onAuthorized) {
      window.DerivWS.onAuthorized(function () {
        log("Deriv connected ✓  ready to trade", "info");
      });
    }

    log("DBot initialized — select a template or import XML to begin", "info");
    updateStats();
  });
})();
