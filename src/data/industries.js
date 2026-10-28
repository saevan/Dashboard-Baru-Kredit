// AUTO-GENERATED oleh tools/build_industries_module.js — JANGAN edit manual.
// Sumber: data/benchmark/industry_benchmark.json (generated_from: IDX Tabulasi Laporan Keuangan 2021-2024).
// Dibuat: 2026-10-01T04:38:08.080Z

export const INDUSTRY_BENCHMARK = {
  "generated_from": "IDX Tabulasi Laporan Keuangan 2021-2024",
  "method": "IQR 1.5x outlier filter + percentile",
  "sectors": {
    "IDX-BASIC-MATERIALS": {
      "industry_code": "IDX-BASIC-MATERIALS",
      "label": "Basic Materials",
      "source_file": "Template Excel Analisis Rasio Keuangan Perusahaan Basic Material 2021-2024 â Profitabilitas, Likuiditas, Solvabilitas (Input Neraca & Laba Rugi).xlsx",
      "benchmarks": {
        "gpm": {
          "n": 433,
          "p10": 0,
          "p25": 0.055919,
          "median": 0.148493,
          "p75": 0.248712,
          "p90": 0.334777,
          "mean": 0.161382,
          "std": 0.136852,
          "direction": "high"
        },
        "opm": {
          "n": 374,
          "p10": -0.007217,
          "p25": 0,
          "median": 0.030854,
          "p75": 0.074545,
          "p90": 0.11162,
          "mean": 0.039302,
          "std": 0.055773,
          "direction": "high"
        },
        "npm": {
          "n": 380,
          "p10": -0.012541,
          "p25": 0,
          "median": 0.037473,
          "p75": 0.081935,
          "p90": 0.122391,
          "mean": 0.044518,
          "std": 0.061478,
          "direction": "high"
        },
        "roa": {
          "n": 402,
          "p10": -0.024841,
          "p25": 0,
          "median": 0.023757,
          "p75": 0.063857,
          "p90": 0.111561,
          "mean": 0.032771,
          "std": 0.052246,
          "direction": "high"
        },
        "roe": {
          "n": 381,
          "p10": -0.011615,
          "p25": 0,
          "median": 0.047599,
          "p75": 0.103105,
          "p90": 0.171784,
          "mean": 0.059108,
          "std": 0.079913,
          "direction": "high"
        },
        "dar": {
          "n": 444,
          "p10": 0,
          "p25": 0.14616,
          "median": 0.375601,
          "p75": 0.574135,
          "p90": 0.728477,
          "mean": 0.380186,
          "std": 0.269795,
          "direction": "low"
        },
        "der": {
          "n": 409,
          "p10": 0,
          "p25": 0.139801,
          "median": 0.501628,
          "p75": 1.10876,
          "p90": 1.761627,
          "mean": 0.701854,
          "std": 0.730898,
          "direction": "low"
        },
        "ltd_to_equity": {
          "n": 390,
          "p10": 0,
          "p25": 0.015103,
          "median": 0.069791,
          "p75": 0.266702,
          "p90": 0.48612,
          "mean": 0.170577,
          "std": 0.21284,
          "direction": "low"
        },
        "debt_to_capital": {
          "n": 444,
          "p10": 0,
          "p25": 0.14616,
          "median": 0.375601,
          "p75": 0.574135,
          "p90": 0.728477,
          "mean": 0.380186,
          "std": 0.269795,
          "direction": "low"
        },
        "icr": {
          "n": 359,
          "p10": -1.564336,
          "p25": 0,
          "median": 0.6653,
          "p75": 3.5392,
          "p90": 7.404255,
          "mean": 1.989531,
          "std": 3.943454,
          "direction": "high"
        },
        "current_ratio": {
          "n": 405,
          "p10": 0,
          "p25": 0.620446,
          "median": 1.329901,
          "p75": 2.188835,
          "p90": 3.465298,
          "mean": 1.578054,
          "std": 1.271894,
          "direction": "high"
        },
        "quick_ratio": {
          "n": 407,
          "p10": 0,
          "p25": 0.371181,
          "median": 0.858194,
          "p75": 1.384561,
          "p90": 2.54532,
          "mean": 1.044498,
          "std": 0.94227,
          "direction": "high"
        },
        "cash_ratio": {
          "n": 397,
          "p10": 0,
          "p25": 0.014755,
          "median": 0.098264,
          "p75": 0.383352,
          "p90": 0.801223,
          "mean": 0.26778,
          "std": 0.370139,
          "direction": "high"
        },
        "cash_turnover": {
          "n": 391,
          "p10": -0.253711,
          "p25": 0,
          "median": 1.830655,
          "p75": 4.346363,
          "p90": 7.91915,
          "mean": 2.587654,
          "std": 3.622594,
          "direction": "high"
        },
        "tato": {
          "n": 434,
          "p10": 0,
          "p25": 0.297588,
          "median": 0.567589,
          "p75": 0.956834,
          "p90": 1.296163,
          "mean": 0.642795,
          "std": 0.495768,
          "direction": "high"
        },
        "fato": {
          "n": 412,
          "p10": 0,
          "p25": 0.401584,
          "median": 0.961093,
          "p75": 2.073007,
          "p90": 3.991873,
          "mean": 1.471642,
          "std": 1.536961,
          "direction": "high"
        },
        "inventory_turnover": {
          "n": 413,
          "p10": 0,
          "p25": 1.709441,
          "median": 3.220694,
          "p75": 5.101995,
          "p90": 6.670314,
          "mean": 3.42506,
          "std": 2.474347,
          "direction": "high"
        },
        "receivable_turnover": {
          "n": 413,
          "p10": 0,
          "p25": 0.175746,
          "median": 0.716389,
          "p75": 1.791287,
          "p90": 2.669424,
          "mean": 1.014938,
          "std": 1.110354,
          "direction": "high"
        },
        "working_capital_turnover": {
          "n": 391,
          "p10": -0.253711,
          "p25": 0,
          "median": 1.830655,
          "p75": 4.346363,
          "p90": 7.91915,
          "mean": 2.587654,
          "std": 3.622594,
          "direction": "high"
        },
        "payable_turnover": {
          "n": 415,
          "p10": 0,
          "p25": 2.847835,
          "median": 6.008287,
          "p75": 10.891053,
          "p90": 17.985265,
          "mean": 7.445391,
          "std": 6.445979,
          "direction": "high"
        }
      }
    },
    "IDX-CONSUMER-CYCLICALS": {
      "industry_code": "IDX-CONSUMER-CYCLICALS",
      "label": "Consumer Cyclicals",
      "source_file": "Template Excel Analisis Rasio Keuangan Perusahaan Consumber Cyclicals 2021-2024 â Profitabilitas, Likuiditas, Solvabilitas (Input Neraca & Laba Rugi).xlsx",
      "benchmarks": {
        "gpm": {
          "n": 640,
          "p10": 0,
          "p25": 0.076141,
          "median": 0.204099,
          "p75": 0.487964,
          "p90": 0.635698,
          "mean": 0.283199,
          "std": 0.262957,
          "direction": "high"
        },
        "opm": {
          "n": 517,
          "p10": -0.067231,
          "p25": 0,
          "median": 0.016166,
          "p75": 0.053691,
          "p90": 0.109602,
          "mean": 0.019408,
          "std": 0.071579,
          "direction": "high"
        },
        "npm": {
          "n": 519,
          "p10": -0.076842,
          "p25": 0,
          "median": 0.017531,
          "p75": 0.055156,
          "p90": 0.114412,
          "mean": 0.019065,
          "std": 0.07591,
          "direction": "high"
        },
        "roa": {
          "n": 584,
          "p10": -0.051097,
          "p25": -0.009187,
          "median": 0.007522,
          "p75": 0.04804,
          "p90": 0.080326,
          "mean": 0.013894,
          "std": 0.052444,
          "direction": "high"
        },
        "roe": {
          "n": 551,
          "p10": -0.059282,
          "p25": 0,
          "median": 0.018947,
          "p75": 0.083957,
          "p90": 0.146196,
          "mean": 0.036833,
          "std": 0.080247,
          "direction": "high"
        },
        "dar": {
          "n": 621,
          "p10": 0,
          "p25": 0.141565,
          "median": 0.334757,
          "p75": 0.54408,
          "p90": 0.756536,
          "mean": 0.367327,
          "std": 0.279255,
          "direction": "low"
        },
        "der": {
          "n": 554,
          "p10": 0,
          "p25": 0.089727,
          "median": 0.392929,
          "p75": 0.846887,
          "p90": 1.345569,
          "mean": 0.51609,
          "std": 0.613751,
          "direction": "low"
        },
        "ltd_to_equity": {
          "n": 546,
          "p10": 0,
          "p25": 0.010342,
          "median": 0.076518,
          "p75": 0.239683,
          "p90": 0.414344,
          "mean": 0.149496,
          "std": 0.191073,
          "direction": "low"
        },
        "debt_to_capital": {
          "n": 621,
          "p10": 0,
          "p25": 0.141565,
          "median": 0.334757,
          "p75": 0.54408,
          "p90": 0.756536,
          "mean": 0.367314,
          "std": 0.279272,
          "direction": "low"
        },
        "icr": {
          "n": 506,
          "p10": -2.904363,
          "p25": -0.841891,
          "median": 0,
          "p75": 1.781274,
          "p90": 4.518207,
          "mean": 0.522406,
          "std": 3.106627,
          "direction": "high"
        },
        "current_ratio": {
          "n": 583,
          "p10": 0,
          "p25": 0.409765,
          "median": 1.231228,
          "p75": 2.115696,
          "p90": 3.748192,
          "mean": 1.559639,
          "std": 1.444146,
          "direction": "high"
        },
        "quick_ratio": {
          "n": 590,
          "p10": 0,
          "p25": 0.156184,
          "median": 0.681883,
          "p75": 1.369099,
          "p90": 2.587216,
          "mean": 0.968123,
          "std": 1.002082,
          "direction": "high"
        },
        "cash_ratio": {
          "n": 568,
          "p10": 0,
          "p25": 0.010025,
          "median": 0.107151,
          "p75": 0.326367,
          "p90": 0.749368,
          "mean": 0.235519,
          "std": 0.316381,
          "direction": "high"
        },
        "cash_turnover": {
          "n": 535,
          "p10": -0.848275,
          "p25": 0,
          "median": 0.992766,
          "p75": 2.999298,
          "p90": 4.661139,
          "mean": 1.446294,
          "std": 2.500609,
          "direction": "high"
        },
        "tato": {
          "n": 621,
          "p10": 0,
          "p25": 0.115802,
          "median": 0.45839,
          "p75": 0.976371,
          "p90": 1.385825,
          "mean": 0.592306,
          "std": 0.53392,
          "direction": "high"
        },
        "fato": {
          "n": 589,
          "p10": 0,
          "p25": 0.140006,
          "median": 0.770419,
          "p75": 1.980911,
          "p90": 3.300562,
          "mean": 1.289778,
          "std": 1.39971,
          "direction": "high"
        },
        "inventory_turnover": {
          "n": 555,
          "p10": 0,
          "p25": 0,
          "median": 1.613351,
          "p75": 4.488064,
          "p90": 7.771002,
          "mean": 2.968695,
          "std": 3.65183,
          "direction": "high"
        },
        "receivable_turnover": {
          "n": 542,
          "p10": 0,
          "p25": 0,
          "median": 0.79864,
          "p75": 1.877499,
          "p90": 4.742073,
          "mean": 1.667242,
          "std": 2.526216,
          "direction": "high"
        },
        "working_capital_turnover": {
          "n": 535,
          "p10": -0.848275,
          "p25": 0,
          "median": 0.992766,
          "p75": 2.999298,
          "p90": 4.661139,
          "mean": 1.446294,
          "std": 2.500609,
          "direction": "high"
        },
        "payable_turnover": {
          "n": 584,
          "p10": 0,
          "p25": 0.456585,
          "median": 4.907341,
          "p75": 9.812539,
          "p90": 17.439145,
          "mean": 6.68962,
          "std": 6.865482,
          "direction": "high"
        }
      }
    },
    "IDX-CONSUMER-NON-CYCLICALS": {
      "industry_code": "IDX-CONSUMER-NON-CYCLICALS",
      "label": "Consumer Non-Cyclicals",
      "source_file": "Template Excel Analisis Rasio Keuangan Perusahaan Consumber Non Cyclicals 2021-2024 â Profitabilitas, Likuiditas, Solvabilitas (Input Neraca & Laba Rugi).xlsx",
      "benchmarks": {
        "gpm": {
          "n": 512,
          "p10": 0,
          "p25": 0.086869,
          "median": 0.192284,
          "p75": 0.306576,
          "p90": 0.452014,
          "mean": 0.210906,
          "std": 0.16209,
          "direction": "high"
        },
        "opm": {
          "n": 459,
          "p10": -0.010365,
          "p25": 0.00057,
          "median": 0.029997,
          "p75": 0.085134,
          "p90": 0.145594,
          "mean": 0.046181,
          "std": 0.066972,
          "direction": "high"
        },
        "npm": {
          "n": 464,
          "p10": -0.007909,
          "p25": 0.001053,
          "median": 0.030554,
          "p75": 0.093998,
          "p90": 0.157526,
          "mean": 0.051413,
          "std": 0.072599,
          "direction": "high"
        },
        "roa": {
          "n": 489,
          "p10": -0.019151,
          "p25": 0.000586,
          "median": 0.038812,
          "p75": 0.085444,
          "p90": 0.141717,
          "mean": 0.047055,
          "std": 0.066712,
          "direction": "high"
        },
        "roe": {
          "n": 462,
          "p10": -0.007753,
          "p25": 0.003762,
          "median": 0.07782,
          "p75": 0.156062,
          "p90": 0.233743,
          "mean": 0.086581,
          "std": 0.10389,
          "direction": "high"
        },
        "dar": {
          "n": 514,
          "p10": 0.0281,
          "p25": 0.19979,
          "median": 0.434507,
          "p75": 0.592812,
          "p90": 0.752495,
          "mean": 0.412566,
          "std": 0.257197,
          "direction": "low"
        },
        "der": {
          "n": 468,
          "p10": 0,
          "p25": 0.212727,
          "median": 0.641762,
          "p75": 1.207718,
          "p90": 1.87765,
          "mean": 0.808337,
          "std": 0.73998,
          "direction": "low"
        },
        "ltd_to_equity": {
          "n": 472,
          "p10": 0,
          "p25": 0.021191,
          "median": 0.097865,
          "p75": 0.381516,
          "p90": 0.69725,
          "mean": 0.238567,
          "std": 0.305397,
          "direction": "low"
        },
        "debt_to_capital": {
          "n": 514,
          "p10": 0.0281,
          "p25": 0.19979,
          "median": 0.434507,
          "p75": 0.592812,
          "p90": 0.752495,
          "mean": 0.412566,
          "std": 0.257197,
          "direction": "low"
        },
        "icr": {
          "n": 420,
          "p10": -1.26456,
          "p25": 0,
          "median": 0.768224,
          "p75": 4.064552,
          "p90": 7.84398,
          "mean": 2.24894,
          "std": 4.772633,
          "direction": "high"
        },
        "current_ratio": {
          "n": 473,
          "p10": 0.018986,
          "p25": 0.772897,
          "median": 1.311287,
          "p75": 2.08097,
          "p90": 3.190177,
          "mean": 1.556836,
          "std": 1.161123,
          "direction": "high"
        },
        "quick_ratio": {
          "n": 473,
          "p10": 0,
          "p25": 0.335874,
          "median": 0.795533,
          "p75": 1.449125,
          "p90": 2.30025,
          "mean": 1.019465,
          "std": 0.897654,
          "direction": "high"
        },
        "cash_ratio": {
          "n": 464,
          "p10": 0.000221,
          "p25": 0.028716,
          "median": 0.142949,
          "p75": 0.429643,
          "p90": 0.847689,
          "mean": 0.285543,
          "std": 0.34178,
          "direction": "high"
        },
        "cash_turnover": {
          "n": 419,
          "p10": -2.863598,
          "p25": 0,
          "median": 2.543307,
          "p75": 5.380347,
          "p90": 8.821201,
          "mean": 2.936566,
          "std": 4.974868,
          "direction": "high"
        },
        "tato": {
          "n": 492,
          "p10": 0.038203,
          "p25": 0.428351,
          "median": 0.786434,
          "p75": 1.358808,
          "p90": 1.999026,
          "mean": 0.92787,
          "std": 0.692298,
          "direction": "high"
        },
        "fato": {
          "n": 469,
          "p10": 0,
          "p25": 0.599917,
          "median": 1.338241,
          "p75": 3.0996,
          "p90": 4.238519,
          "mean": 1.92555,
          "std": 1.709271,
          "direction": "high"
        },
        "inventory_turnover": {
          "n": 478,
          "p10": 0,
          "p25": 2.422972,
          "median": 5.021874,
          "p75": 7.342108,
          "p90": 11.258907,
          "mean": 5.365731,
          "std": 3.968909,
          "direction": "high"
        },
        "receivable_turnover": {
          "n": 467,
          "p10": 0,
          "p25": 0.552916,
          "median": 1.378305,
          "p75": 3.116718,
          "p90": 4.900587,
          "mean": 2.10173,
          "std": 2.145291,
          "direction": "high"
        },
        "working_capital_turnover": {
          "n": 419,
          "p10": -2.863598,
          "p25": 0,
          "median": 2.543307,
          "p75": 5.380347,
          "p90": 8.821201,
          "mean": 2.936566,
          "std": 4.974868,
          "direction": "high"
        },
        "payable_turnover": {
          "n": 473,
          "p10": 0,
          "p25": 4.782981,
          "median": 8.185552,
          "p75": 13.968906,
          "p90": 22.387344,
          "mean": 10.220592,
          "std": 8.243994,
          "direction": "high"
        }
      }
    },
    "IDX-ENERGY": {
      "industry_code": "IDX-ENERGY",
      "label": "Energy",
      "source_file": "Template Excel Analisis Rasio Keuangan Perusahaan Energy 2021-2024 â Profitabilitas, Likuiditas, Solvabilitas (Input Neraca & Laba Rugi).xlsx",
      "benchmarks": {
        "gpm": {
          "n": 346,
          "p10": 0,
          "p25": 0.093448,
          "median": 0.208366,
          "p75": 0.332959,
          "p90": 0.443341,
          "mean": 0.222081,
          "std": 0.166129,
          "direction": "high"
        },
        "opm": {
          "n": 319,
          "p10": 0,
          "p25": 0.002895,
          "median": 0.073074,
          "p75": 0.16445,
          "p90": 0.275389,
          "mean": 0.097962,
          "std": 0.121158,
          "direction": "high"
        },
        "npm": {
          "n": 318,
          "p10": 0,
          "p25": 0.003801,
          "median": 0.072459,
          "p75": 0.159027,
          "p90": 0.262382,
          "mean": 0.095718,
          "std": 0.120559,
          "direction": "high"
        },
        "roa": {
          "n": 322,
          "p10": -0.018037,
          "p25": 0,
          "median": 0.038513,
          "p75": 0.097341,
          "p90": 0.164929,
          "mean": 0.053571,
          "std": 0.081711,
          "direction": "high"
        },
        "roe": {
          "n": 317,
          "p10": 0,
          "p25": 0.006974,
          "median": 0.083271,
          "p75": 0.185107,
          "p90": 0.321833,
          "mean": 0.112165,
          "std": 0.141299,
          "direction": "high"
        },
        "dar": {
          "n": 350,
          "p10": 0,
          "p25": 0.198289,
          "median": 0.426139,
          "p75": 0.584214,
          "p90": 0.759245,
          "mean": 0.410881,
          "std": 0.26784,
          "direction": "low"
        },
        "der": {
          "n": 315,
          "p10": 0,
          "p25": 0.21631,
          "median": 0.619462,
          "p75": 1.156935,
          "p90": 1.680234,
          "mean": 0.75658,
          "std": 0.702568,
          "direction": "low"
        },
        "ltd_to_equity": {
          "n": 329,
          "p10": 0,
          "p25": 0.025283,
          "median": 0.135521,
          "p75": 0.504635,
          "p90": 0.883011,
          "mean": 0.301696,
          "std": 0.382939,
          "direction": "low"
        },
        "debt_to_capital": {
          "n": 350,
          "p10": 0,
          "p25": 0.198289,
          "median": 0.426139,
          "p75": 0.584214,
          "p90": 0.759245,
          "mean": 0.410881,
          "std": 0.26784,
          "direction": "low"
        },
        "icr": {
          "n": 295,
          "p10": -1.017839,
          "p25": 0,
          "median": 1.270016,
          "p75": 4.704998,
          "p90": 15.885246,
          "mean": 4.200822,
          "std": 8.543646,
          "direction": "high"
        },
        "current_ratio": {
          "n": 338,
          "p10": 0,
          "p25": 0.491775,
          "median": 1.264579,
          "p75": 1.971221,
          "p90": 2.961677,
          "mean": 1.372715,
          "std": 1.108332,
          "direction": "high"
        },
        "quick_ratio": {
          "n": 339,
          "p10": 0,
          "p25": 0.299598,
          "median": 1.090149,
          "p75": 1.767421,
          "p90": 2.542095,
          "mean": 1.199521,
          "std": 1.018024,
          "direction": "high"
        },
        "cash_ratio": {
          "n": 337,
          "p10": 0,
          "p25": 0.021356,
          "median": 0.226769,
          "p75": 0.678838,
          "p90": 1.477083,
          "mean": 0.471878,
          "std": 0.575749,
          "direction": "high"
        },
        "cash_turnover": {
          "n": 315,
          "p10": -1.392722,
          "p25": 0,
          "median": 1.809617,
          "p75": 4.315632,
          "p90": 7.680041,
          "mean": 2.299424,
          "std": 3.926125,
          "direction": "high"
        },
        "tato": {
          "n": 349,
          "p10": 0,
          "p25": 0.253669,
          "median": 0.48885,
          "p75": 0.837531,
          "p90": 1.225795,
          "mean": 0.581716,
          "std": 0.450265,
          "direction": "high"
        },
        "fato": {
          "n": 329,
          "p10": 0,
          "p25": 0.292388,
          "median": 0.65507,
          "p75": 1.351703,
          "p90": 2.358228,
          "mean": 0.924738,
          "std": 0.890492,
          "direction": "high"
        },
        "inventory_turnover": {
          "n": 333,
          "p10": 0,
          "p25": 0,
          "median": 7.911251,
          "p75": 21.334336,
          "p90": 36.824334,
          "mean": 13.522439,
          "std": 15.397019,
          "direction": "high"
        },
        "receivable_turnover": {
          "n": 330,
          "p10": 0,
          "p25": 0.233984,
          "median": 0.943018,
          "p75": 1.968344,
          "p90": 3.554927,
          "mean": 1.325637,
          "std": 1.444256,
          "direction": "high"
        },
        "working_capital_turnover": {
          "n": 315,
          "p10": -1.392722,
          "p25": 0,
          "median": 1.809617,
          "p75": 4.315632,
          "p90": 7.680041,
          "mean": 2.299424,
          "std": 3.926125,
          "direction": "high"
        },
        "payable_turnover": {
          "n": 340,
          "p10": 0,
          "p25": 1.930181,
          "median": 5.591343,
          "p75": 10.94705,
          "p90": 16.041004,
          "mean": 7.135906,
          "std": 6.433611,
          "direction": "high"
        }
      }
    },
    "IDX-FINANCIALS": {
      "industry_code": "IDX-FINANCIALS",
      "label": "Financials",
      "source_file": "Template Excel Analisis Rasio Keuangan Perusahaan Financial 2021-2024 â Profitabilitas, Likuiditas, Solvabilitas (Input Neraca & Laba Rugi).xlsx",
      "benchmarks": {
        "gpm": {
          "n": 334,
          "p10": 0,
          "p25": 0.021726,
          "median": 0.091722,
          "p75": 0.205602,
          "p90": 0.324864,
          "mean": 0.12871,
          "std": 0.149033,
          "direction": "high"
        },
        "opm": {
          "n": 333,
          "p10": 0,
          "p25": 0.021494,
          "median": 0.09212,
          "p75": 0.199816,
          "p90": 0.320961,
          "mean": 0.126747,
          "std": 0.144923,
          "direction": "high"
        },
        "npm": {
          "n": 335,
          "p10": -0.000382,
          "p25": 0.014788,
          "median": 0.082796,
          "p75": 0.210042,
          "p90": 0.325737,
          "mean": 0.125061,
          "std": 0.154461,
          "direction": "high"
        },
        "roa": {
          "n": 342,
          "p10": -0.000077,
          "p25": 0.002749,
          "median": 0.010472,
          "p75": 0.022761,
          "p90": 0.039513,
          "mean": 0.01394,
          "std": 0.017082,
          "direction": "high"
        },
        "roe": {
          "n": 365,
          "p10": -0.000251,
          "p25": 0.010073,
          "median": 0.043284,
          "p75": 0.078709,
          "p90": 0.133183,
          "mean": 0.050307,
          "std": 0.055943,
          "direction": "high"
        },
        "dar": {
          "n": 416,
          "p10": 0.021406,
          "p25": 0.287883,
          "median": 0.642395,
          "p75": 0.788795,
          "p90": 0.854816,
          "mean": 0.534887,
          "std": 0.30245,
          "direction": "low"
        },
        "der": {
          "n": 411,
          "p10": 0.008014,
          "p25": 0.414744,
          "median": 1.767596,
          "p75": 3.814469,
          "p90": 5.781788,
          "mean": 2.416058,
          "std": 2.334673,
          "direction": "low"
        },
        "ltd_to_equity": {
          "n": 375,
          "p10": 0,
          "p25": 0.004372,
          "median": 0.010416,
          "p75": 0.024451,
          "p90": 0.042801,
          "mean": 0.016932,
          "std": 0.017861,
          "direction": "low"
        },
        "debt_to_capital": {
          "n": 416,
          "p10": 0.021406,
          "p25": 0.312679,
          "median": 0.649722,
          "p75": 0.806385,
          "p90": 0.85657,
          "mean": 0.548781,
          "std": 0.30165,
          "direction": "low"
        },
        "icr": {
          "n": 337,
          "p10": 0,
          "p25": 0.066442,
          "median": 0.319382,
          "p75": 0.899033,
          "p90": 1.526618,
          "mean": 0.525522,
          "std": 0.707122,
          "direction": "high"
        },
        "current_ratio": {
          "n": 377,
          "p10": 1.098534,
          "p25": 6.669587,
          "median": 24.117227,
          "p75": 67.709681,
          "p90": 135.181843,
          "mean": 49.176756,
          "std": 58.809185,
          "direction": "high"
        },
        "quick_ratio": {
          "n": 376,
          "p10": 1.093907,
          "p25": 6.601854,
          "median": 23.536527,
          "p75": 65.58707,
          "p90": 129.156637,
          "mean": 47.467609,
          "std": 56.013474,
          "direction": "high"
        },
        "cash_ratio": {
          "n": 350,
          "p10": 0.010063,
          "p25": 0.395423,
          "median": 1.715248,
          "p75": 4.724243,
          "p90": 10.44886,
          "mean": 3.469357,
          "std": 4.458752,
          "direction": "high"
        },
        "cash_turnover": {
          "n": 340,
          "p10": 0,
          "p25": 0.060163,
          "median": 0.231831,
          "p75": 0.505898,
          "p90": 0.968745,
          "mean": 0.381803,
          "std": 0.48311,
          "direction": "high"
        },
        "tato": {
          "n": 345,
          "p10": 0,
          "p25": 0.001747,
          "median": 0.049169,
          "p75": 0.067128,
          "p90": 0.10214,
          "mean": 0.047899,
          "std": 0.054356,
          "direction": "high"
        },
        "fato": {
          "n": 346,
          "p10": 0,
          "p25": 0.014517,
          "median": 0.120059,
          "p75": 0.349819,
          "p90": 0.692888,
          "mean": 0.265157,
          "std": 0.360256,
          "direction": "high"
        },
        "inventory_turnover": {
          "n": 416,
          "p10": 0,
          "p25": 0,
          "median": 0,
          "p75": 0,
          "p90": 0,
          "mean": 0,
          "std": 0,
          "direction": "high"
        },
        "receivable_turnover": {
          "n": 394,
          "p10": 0,
          "p25": 0,
          "median": 0,
          "p75": 0,
          "p90": 0,
          "mean": 0,
          "std": 0,
          "direction": "high"
        },
        "working_capital_turnover": {
          "n": 342,
          "p10": 0,
          "p25": 0.019721,
          "median": 0.206526,
          "p75": 0.501537,
          "p90": 0.96567,
          "mean": 0.363425,
          "std": 0.490028,
          "direction": "high"
        },
        "payable_turnover": {
          "n": 357,
          "p10": 0.146387,
          "p25": 1.393183,
          "median": 3.941587,
          "p75": 10.218165,
          "p90": 23.221862,
          "mean": 8.25049,
          "std": 10.740434,
          "direction": "high"
        }
      }
    },
    "IDX-INDUSTRIALS": {
      "industry_code": "IDX-INDUSTRIALS",
      "label": "Industrials",
      "source_file": "Template Excel Analisis Rasio Keuangan Perusahaan Industrial 2021-2024 â Profitabilitas, Likuiditas, Solvabilitas (Input Neraca & Laba Rugi).xlsx",
      "benchmarks": {
        "gpm": {
          "n": 256,
          "p10": 0,
          "p25": 0.082214,
          "median": 0.211302,
          "p75": 0.344702,
          "p90": 0.472435,
          "mean": 0.221274,
          "std": 0.168411,
          "direction": "high"
        },
        "opm": {
          "n": 225,
          "p10": -0.021373,
          "p25": 0,
          "median": 0.028675,
          "p75": 0.089815,
          "p90": 0.141431,
          "mean": 0.045632,
          "std": 0.069072,
          "direction": "high"
        },
        "npm": {
          "n": 225,
          "p10": -0.012981,
          "p25": 0,
          "median": 0.038988,
          "p75": 0.100431,
          "p90": 0.152767,
          "mean": 0.052332,
          "std": 0.073438,
          "direction": "high"
        },
        "roa": {
          "n": 237,
          "p10": -0.035327,
          "p25": 0,
          "median": 0.023636,
          "p75": 0.07286,
          "p90": 0.117332,
          "mean": 0.034218,
          "std": 0.059609,
          "direction": "high"
        },
        "roe": {
          "n": 242,
          "p10": -0.042612,
          "p25": 0,
          "median": 0.060293,
          "p75": 0.134972,
          "p90": 0.225406,
          "mean": 0.073943,
          "std": 0.109695,
          "direction": "high"
        },
        "dar": {
          "n": 246,
          "p10": 0,
          "p25": 0.178167,
          "median": 0.357452,
          "p75": 0.514766,
          "p90": 0.699702,
          "mean": 0.362445,
          "std": 0.240877,
          "direction": "low"
        },
        "der": {
          "n": 218,
          "p10": 0,
          "p25": 0.181264,
          "median": 0.506112,
          "p75": 0.766598,
          "p90": 1.272002,
          "mean": 0.563514,
          "std": 0.478172,
          "direction": "low"
        },
        "ltd_to_equity": {
          "n": 217,
          "p10": 0,
          "p25": 0.021733,
          "median": 0.075811,
          "p75": 0.191922,
          "p90": 0.281804,
          "mean": 0.114367,
          "std": 0.120303,
          "direction": "low"
        },
        "debt_to_capital": {
          "n": 246,
          "p10": 0,
          "p25": 0.178167,
          "median": 0.357452,
          "p75": 0.514766,
          "p90": 0.699702,
          "mean": 0.362445,
          "std": 0.240877,
          "direction": "low"
        },
        "icr": {
          "n": 221,
          "p10": -1.516218,
          "p25": 0,
          "median": 0.964293,
          "p75": 5.280461,
          "p90": 13.482194,
          "mean": 3.086431,
          "std": 6.430637,
          "direction": "high"
        },
        "current_ratio": {
          "n": 228,
          "p10": 0,
          "p25": 0.950767,
          "median": 1.527661,
          "p75": 2.295245,
          "p90": 2.892844,
          "mean": 1.630656,
          "std": 1.073911,
          "direction": "high"
        },
        "quick_ratio": {
          "n": 233,
          "p10": 0,
          "p25": 0.518806,
          "median": 0.945418,
          "p75": 1.511506,
          "p90": 2.365948,
          "mean": 1.099594,
          "std": 0.866222,
          "direction": "high"
        },
        "cash_ratio": {
          "n": 234,
          "p10": 0,
          "p25": 0.030774,
          "median": 0.15601,
          "p75": 0.484238,
          "p90": 0.855682,
          "mean": 0.301337,
          "std": 0.354734,
          "direction": "high"
        },
        "cash_turnover": {
          "n": 229,
          "p10": 0,
          "p25": 0.569164,
          "median": 2.224185,
          "p75": 4.116368,
          "p90": 6.932609,
          "mean": 2.676446,
          "std": 2.791268,
          "direction": "high"
        },
        "tato": {
          "n": 247,
          "p10": 0,
          "p25": 0.249553,
          "median": 0.607904,
          "p75": 0.961838,
          "p90": 1.307171,
          "mean": 0.658717,
          "std": 0.496547,
          "direction": "high"
        },
        "fato": {
          "n": 238,
          "p10": 0,
          "p25": 0.453478,
          "median": 1.101176,
          "p75": 2.042379,
          "p90": 4.060709,
          "mean": 1.593312,
          "std": 1.597898,
          "direction": "high"
        },
        "inventory_turnover": {
          "n": 235,
          "p10": 0,
          "p25": 0.546905,
          "median": 2.295957,
          "p75": 4.104505,
          "p90": 8.681653,
          "mean": 3.051426,
          "std": 3.1388,
          "direction": "high"
        },
        "receivable_turnover": {
          "n": 247,
          "p10": 0,
          "p25": 0.301346,
          "median": 0.802937,
          "p75": 1.685402,
          "p90": 2.320244,
          "mean": 1.046184,
          "std": 0.923933,
          "direction": "high"
        },
        "working_capital_turnover": {
          "n": 229,
          "p10": 0,
          "p25": 0.569164,
          "median": 2.224185,
          "p75": 4.116368,
          "p90": 6.932609,
          "mean": 2.676446,
          "std": 2.791268,
          "direction": "high"
        },
        "payable_turnover": {
          "n": 227,
          "p10": 0,
          "p25": 2.553683,
          "median": 5.292794,
          "p75": 9.940664,
          "p90": 13.495872,
          "mean": 6.577522,
          "std": 5.760984,
          "direction": "high"
        }
      }
    },
    "IDX-INFRASTRUCTURE": {
      "industry_code": "IDX-INFRASTRUCTURE",
      "label": "Infrastructure",
      "source_file": "Template Excel Analisis Rasio Keuangan Perusahaan Infrastruktur 2021-2024 â Profitabilitas, Likuiditas, Solvabilitas (Input Neraca & Laba Rugi).xlsx",
      "benchmarks": {
        "gpm": {
          "n": 269,
          "p10": 0,
          "p25": 0.121167,
          "median": 0.230576,
          "p75": 0.441433,
          "p90": 0.610073,
          "mean": 0.28323,
          "std": 0.227238,
          "direction": "high"
        },
        "opm": {
          "n": 236,
          "p10": -0.041863,
          "p25": 0.00972,
          "median": 0.06138,
          "p75": 0.17864,
          "p90": 0.260089,
          "mean": 0.089806,
          "std": 0.127899,
          "direction": "high"
        },
        "npm": {
          "n": 235,
          "p10": -0.066404,
          "p25": 0.005909,
          "median": 0.063946,
          "p75": 0.173498,
          "p90": 0.257242,
          "mean": 0.085445,
          "std": 0.127348,
          "direction": "high"
        },
        "roa": {
          "n": 237,
          "p10": -0.019927,
          "p25": 0.000623,
          "median": 0.02406,
          "p75": 0.047545,
          "p90": 0.083471,
          "mean": 0.026955,
          "std": 0.038509,
          "direction": "high"
        },
        "roe": {
          "n": 243,
          "p10": -0.03925,
          "p25": 0.001009,
          "median": 0.04763,
          "p75": 0.102552,
          "p90": 0.166877,
          "mean": 0.053518,
          "std": 0.083665,
          "direction": "high"
        },
        "dar": {
          "n": 267,
          "p10": 0.056732,
          "p25": 0.238287,
          "median": 0.461012,
          "p75": 0.6589,
          "p90": 0.774082,
          "mean": 0.447255,
          "std": 0.268416,
          "direction": "low"
        },
        "der": {
          "n": 251,
          "p10": 0,
          "p25": 0.216072,
          "median": 0.749609,
          "p75": 1.292697,
          "p90": 2.557152,
          "mean": 0.922812,
          "std": 0.979952,
          "direction": "low"
        },
        "ltd_to_equity": {
          "n": 250,
          "p10": 0,
          "p25": 0.017509,
          "median": 0.175732,
          "p75": 0.632797,
          "p90": 1.043509,
          "mean": 0.359498,
          "std": 0.479315,
          "direction": "low"
        },
        "debt_to_capital": {
          "n": 267,
          "p10": 0.056732,
          "p25": 0.238287,
          "median": 0.461012,
          "p75": 0.6589,
          "p90": 0.774082,
          "mean": 0.447255,
          "std": 0.268416,
          "direction": "low"
        },
        "icr": {
          "n": 227,
          "p10": -0.865843,
          "p25": 0,
          "median": 0.720552,
          "p75": 2.453086,
          "p90": 5.70182,
          "mean": 1.480992,
          "std": 2.84503,
          "direction": "high"
        },
        "current_ratio": {
          "n": 248,
          "p10": 0.045295,
          "p25": 0.348605,
          "median": 1.06198,
          "p75": 1.813498,
          "p90": 2.958027,
          "mean": 1.255639,
          "std": 1.081941,
          "direction": "high"
        },
        "quick_ratio": {
          "n": 253,
          "p10": 0,
          "p25": 0.296522,
          "median": 0.842678,
          "p75": 1.665356,
          "p90": 2.668736,
          "mean": 1.109616,
          "std": 1.021737,
          "direction": "high"
        },
        "cash_ratio": {
          "n": 244,
          "p10": 0.0016,
          "p25": 0.040515,
          "median": 0.176413,
          "p75": 0.417196,
          "p90": 0.70886,
          "mean": 0.272229,
          "std": 0.29698,
          "direction": "high"
        },
        "cash_turnover": {
          "n": 242,
          "p10": -1.894535,
          "p25": -0.471489,
          "median": 0.5534,
          "p75": 1.935636,
          "p90": 3.771748,
          "mean": 0.706411,
          "std": 2.178863,
          "direction": "high"
        },
        "tato": {
          "n": 270,
          "p10": 0.015565,
          "p25": 0.139844,
          "median": 0.288305,
          "p75": 0.52739,
          "p90": 0.749325,
          "mean": 0.350257,
          "std": 0.275872,
          "direction": "high"
        },
        "fato": {
          "n": 253,
          "p10": 0.01745,
          "p25": 0.166917,
          "median": 0.391829,
          "p75": 0.919345,
          "p90": 1.715186,
          "mean": 0.65473,
          "std": 0.683344,
          "direction": "high"
        },
        "inventory_turnover": {
          "n": 238,
          "p10": 0,
          "p25": 0,
          "median": 0,
          "p75": 4.477919,
          "p90": 14.478571,
          "mean": 3.568264,
          "std": 6.584154,
          "direction": "high"
        },
        "receivable_turnover": {
          "n": 253,
          "p10": 0,
          "p25": 0,
          "median": 0.560415,
          "p75": 1.493663,
          "p90": 2.8817,
          "mean": 0.983061,
          "std": 1.255794,
          "direction": "high"
        },
        "working_capital_turnover": {
          "n": 242,
          "p10": -1.894535,
          "p25": -0.471489,
          "median": 0.5534,
          "p75": 1.935636,
          "p90": 3.771748,
          "mean": 0.706411,
          "std": 2.178863,
          "direction": "high"
        },
        "payable_turnover": {
          "n": 255,
          "p10": 0,
          "p25": 0,
          "median": 2.506071,
          "p75": 6.583568,
          "p90": 12.81916,
          "mean": 4.573927,
          "std": 5.623821,
          "direction": "high"
        }
      }
    },
    "IDX-HEALTHCARE": {
      "industry_code": "IDX-HEALTHCARE",
      "label": "Healthcare",
      "source_file": "Template Excel Analisis Rasio Keuangan Perusahaan Kesehatan 2021-2024 â Profitabilitas, Likuiditas, Solvabilitas (Input Neraca & Laba Rugi).xlsx",
      "benchmarks": {
        "gpm": {
          "n": 150,
          "p10": 0,
          "p25": 0.117311,
          "median": 0.323902,
          "p75": 0.42238,
          "p90": 0.519709,
          "mean": 0.28151,
          "std": 0.199102,
          "direction": "high"
        },
        "opm": {
          "n": 130,
          "p10": -0.009882,
          "p25": 0,
          "median": 0.043437,
          "p75": 0.09088,
          "p90": 0.133023,
          "mean": 0.049899,
          "std": 0.06561,
          "direction": "high"
        },
        "npm": {
          "n": 133,
          "p10": -0.007308,
          "p25": 0,
          "median": 0.046572,
          "p75": 0.100175,
          "p90": 0.158638,
          "mean": 0.058109,
          "std": 0.078019,
          "direction": "high"
        },
        "roa": {
          "n": 138,
          "p10": -0.013464,
          "p25": 0,
          "median": 0.029554,
          "p75": 0.085748,
          "p90": 0.126715,
          "mean": 0.043084,
          "std": 0.065902,
          "direction": "high"
        },
        "roe": {
          "n": 137,
          "p10": -0.011222,
          "p25": 0,
          "median": 0.062115,
          "p75": 0.142141,
          "p90": 0.19397,
          "mean": 0.076714,
          "std": 0.098017,
          "direction": "high"
        },
        "dar": {
          "n": 150,
          "p10": 0,
          "p25": 0.12594,
          "median": 0.283321,
          "p75": 0.44901,
          "p90": 0.693755,
          "mean": 0.31042,
          "std": 0.2411,
          "direction": "low"
        },
        "der": {
          "n": 130,
          "p10": 0,
          "p25": 0.127265,
          "median": 0.333851,
          "p75": 0.604228,
          "p90": 0.902071,
          "mean": 0.406196,
          "std": 0.387567,
          "direction": "low"
        },
        "ltd_to_equity": {
          "n": 137,
          "p10": 0,
          "p25": 0.010624,
          "median": 0.053497,
          "p75": 0.199353,
          "p90": 0.36856,
          "mean": 0.118361,
          "std": 0.149518,
          "direction": "low"
        },
        "debt_to_capital": {
          "n": 150,
          "p10": 0,
          "p25": 0.12594,
          "median": 0.283321,
          "p75": 0.44901,
          "p90": 0.693755,
          "mean": 0.31042,
          "std": 0.2411,
          "direction": "low"
        },
        "icr": {
          "n": 123,
          "p10": -0.976434,
          "p25": 0,
          "median": 0.208514,
          "p75": 7.051244,
          "p90": 20.557887,
          "mean": 5.25885,
          "std": 10.990625,
          "direction": "high"
        },
        "current_ratio": {
          "n": 146,
          "p10": 0,
          "p25": 0.756699,
          "median": 1.531642,
          "p75": 3.080125,
          "p90": 4.223661,
          "mean": 1.970857,
          "std": 1.622902,
          "direction": "high"
        },
        "quick_ratio": {
          "n": 143,
          "p10": 0,
          "p25": 0.583034,
          "median": 1.140968,
          "p75": 2.009444,
          "p90": 3.266026,
          "mean": 1.414047,
          "std": 1.19015,
          "direction": "high"
        },
        "cash_ratio": {
          "n": 146,
          "p10": 0,
          "p25": 0.025241,
          "median": 0.305493,
          "p75": 0.915134,
          "p90": 1.677,
          "mean": 0.596846,
          "std": 0.684398,
          "direction": "high"
        },
        "cash_turnover": {
          "n": 128,
          "p10": 0,
          "p25": 0,
          "median": 2.129836,
          "p75": 3.279341,
          "p90": 5.008541,
          "mean": 2.144325,
          "std": 2.440746,
          "direction": "high"
        },
        "tato": {
          "n": 148,
          "p10": 0,
          "p25": 0.283132,
          "median": 0.5783,
          "p75": 0.957069,
          "p90": 1.261057,
          "mean": 0.643795,
          "std": 0.491646,
          "direction": "high"
        },
        "fato": {
          "n": 137,
          "p10": 0,
          "p25": 0.311108,
          "median": 0.844077,
          "p75": 2.160116,
          "p90": 3.383894,
          "mean": 1.350009,
          "std": 1.364401,
          "direction": "high"
        },
        "inventory_turnover": {
          "n": 152,
          "p10": 0,
          "p25": 1.605506,
          "median": 3.801347,
          "p75": 17.925956,
          "p90": 26.7191,
          "mean": 9.002391,
          "std": 10.640102,
          "direction": "high"
        },
        "receivable_turnover": {
          "n": 145,
          "p10": 0,
          "p25": 0.504526,
          "median": 1.489778,
          "p75": 2.507825,
          "p90": 3.164389,
          "mean": 1.539424,
          "std": 1.351618,
          "direction": "high"
        },
        "working_capital_turnover": {
          "n": 128,
          "p10": 0,
          "p25": 0,
          "median": 2.129836,
          "p75": 3.279341,
          "p90": 5.008541,
          "mean": 2.144325,
          "std": 2.440746,
          "direction": "high"
        },
        "payable_turnover": {
          "n": 145,
          "p10": 0,
          "p25": 2.595218,
          "median": 6.341206,
          "p75": 9.140179,
          "p90": 12.593094,
          "mean": 6.204825,
          "std": 4.443997,
          "direction": "high"
        }
      }
    },
    "IDX-TECHNOLOGY": {
      "industry_code": "IDX-TECHNOLOGY",
      "label": "Technology",
      "source_file": "Template Excel Analisis Rasio Keuangan Perusahaan Teknologi 2021-2024 â Profitabilitas, Likuiditas, Solvabilitas (Input Neraca & Laba Rugi).xlsx",
      "benchmarks": {
        "gpm": {
          "n": 175,
          "p10": 0,
          "p25": 0.019498,
          "median": 0.121062,
          "p75": 0.237159,
          "p90": 0.411954,
          "mean": 0.157459,
          "std": 0.174426,
          "direction": "high"
        },
        "opm": {
          "n": 142,
          "p10": -0.009564,
          "p25": 0,
          "median": 0.012294,
          "p75": 0.05405,
          "p90": 0.113281,
          "mean": 0.030734,
          "std": 0.052381,
          "direction": "high"
        },
        "npm": {
          "n": 141,
          "p10": -0.008962,
          "p25": 0,
          "median": 0.016986,
          "p75": 0.059421,
          "p90": 0.112507,
          "mean": 0.032951,
          "std": 0.054217,
          "direction": "high"
        },
        "roa": {
          "n": 165,
          "p10": -0.062858,
          "p25": 0,
          "median": 0.02875,
          "p75": 0.078441,
          "p90": 0.113692,
          "mean": 0.031917,
          "std": 0.074988,
          "direction": "high"
        },
        "roe": {
          "n": 157,
          "p10": -0.073728,
          "p25": 0,
          "median": 0.035074,
          "p75": 0.131139,
          "p90": 0.234874,
          "mean": 0.058941,
          "std": 0.127222,
          "direction": "high"
        },
        "dar": {
          "n": 185,
          "p10": 0,
          "p25": 0.096155,
          "median": 0.245658,
          "p75": 0.469461,
          "p90": 0.619123,
          "mean": 0.290866,
          "std": 0.239919,
          "direction": "low"
        },
        "der": {
          "n": 173,
          "p10": 0,
          "p25": 0.093543,
          "median": 0.288223,
          "p75": 0.760464,
          "p90": 1.172382,
          "mean": 0.459547,
          "std": 0.478667,
          "direction": "low"
        },
        "ltd_to_equity": {
          "n": 161,
          "p10": 0,
          "p25": 0.006209,
          "median": 0.031924,
          "p75": 0.08309,
          "p90": 0.184429,
          "mean": 0.061301,
          "std": 0.077854,
          "direction": "low"
        },
        "debt_to_capital": {
          "n": 185,
          "p10": 0,
          "p25": 0.096155,
          "median": 0.245658,
          "p75": 0.469461,
          "p90": 0.619123,
          "mean": 0.290866,
          "std": 0.239919,
          "direction": "low"
        },
        "icr": {
          "n": 124,
          "p10": -0.645568,
          "p25": 0,
          "median": 1.184807,
          "p75": 5.140219,
          "p90": 11.035408,
          "mean": 2.904141,
          "std": 5.752709,
          "direction": "high"
        },
        "current_ratio": {
          "n": 167,
          "p10": 0,
          "p25": 1.062754,
          "median": 1.960406,
          "p75": 3.18289,
          "p90": 6.694738,
          "mean": 2.638988,
          "std": 2.485324,
          "direction": "high"
        },
        "quick_ratio": {
          "n": 159,
          "p10": 0,
          "p25": 0.616044,
          "median": 1.168084,
          "p75": 2.113662,
          "p90": 3.103672,
          "mean": 1.469986,
          "std": 1.292251,
          "direction": "high"
        },
        "cash_ratio": {
          "n": 162,
          "p10": 0,
          "p25": 0.075944,
          "median": 0.281861,
          "p75": 0.612863,
          "p90": 1.032955,
          "mean": 0.426442,
          "std": 0.475311,
          "direction": "high"
        },
        "cash_turnover": {
          "n": 169,
          "p10": 0,
          "p25": 0.515449,
          "median": 2.502263,
          "p75": 6.731168,
          "p90": 11.81593,
          "mean": 4.257439,
          "std": 4.980372,
          "direction": "high"
        },
        "tato": {
          "n": 168,
          "p10": 0,
          "p25": 0.233948,
          "median": 0.76955,
          "p75": 1.662004,
          "p90": 2.343851,
          "mean": 1.047812,
          "std": 1.050085,
          "direction": "high"
        },
        "fato": {
          "n": 166,
          "p10": 0,
          "p25": 0.412116,
          "median": 1.579577,
          "p75": 5.032956,
          "p90": 13.381654,
          "mean": 4.338573,
          "std": 6.114359,
          "direction": "high"
        },
        "inventory_turnover": {
          "n": 165,
          "p10": 0,
          "p25": 0,
          "median": 2.936143,
          "p75": 7.223437,
          "p90": 19.918009,
          "mean": 5.947526,
          "std": 8.435108,
          "direction": "high"
        },
        "receivable_turnover": {
          "n": 173,
          "p10": 0,
          "p25": 0.272609,
          "median": 0.72848,
          "p75": 1.564693,
          "p90": 2.331602,
          "mean": 0.985305,
          "std": 0.922155,
          "direction": "high"
        },
        "working_capital_turnover": {
          "n": 169,
          "p10": 0,
          "p25": 0.515449,
          "median": 2.502263,
          "p75": 6.731168,
          "p90": 11.81593,
          "mean": 4.257439,
          "std": 4.980372,
          "direction": "high"
        },
        "payable_turnover": {
          "n": 161,
          "p10": 0,
          "p25": 1.328196,
          "median": 6.725094,
          "p75": 15.827765,
          "p90": 42.408683,
          "mean": 13.787122,
          "std": 18.727752,
          "direction": "high"
        }
      }
    },
    "IDX-TRANSPORTATION": {
      "industry_code": "IDX-TRANSPORTATION",
      "label": "Transportation & Logistic",
      "source_file": "Template Excel Analisis Rasio Keuangan Perusahaan Transportasi dan Logistic 2021-2024 â Profitabilitas, Likuiditas, Solvabilitas (Input Neraca & Laba Rugi).xlsx",
      "benchmarks": {
        "gpm": {
          "n": 146,
          "p10": 0,
          "p25": 0.131677,
          "median": 0.253016,
          "p75": 0.340302,
          "p90": 0.414655,
          "mean": 0.234067,
          "std": 0.159889,
          "direction": "high"
        },
        "opm": {
          "n": 128,
          "p10": -0.0092,
          "p25": 0.00143,
          "median": 0.052609,
          "p75": 0.093315,
          "p90": 0.15845,
          "mean": 0.051183,
          "std": 0.079548,
          "direction": "high"
        },
        "npm": {
          "n": 129,
          "p10": 0,
          "p25": 0.003844,
          "median": 0.058896,
          "p75": 0.096999,
          "p90": 0.169816,
          "mean": 0.058881,
          "std": 0.084804,
          "direction": "high"
        },
        "roa": {
          "n": 140,
          "p10": -0.034401,
          "p25": 0.000256,
          "median": 0.033976,
          "p75": 0.071816,
          "p90": 0.150519,
          "mean": 0.04406,
          "std": 0.067539,
          "direction": "high"
        },
        "roe": {
          "n": 139,
          "p10": -0.04001,
          "p25": 0.000261,
          "median": 0.079751,
          "p75": 0.127074,
          "p90": 0.229996,
          "mean": 0.075672,
          "std": 0.106011,
          "direction": "high"
        },
        "dar": {
          "n": 149,
          "p10": 0,
          "p25": 0.164457,
          "median": 0.325884,
          "p75": 0.534596,
          "p90": 0.783203,
          "mean": 0.382655,
          "std": 0.299544,
          "direction": "low"
        },
        "der": {
          "n": 125,
          "p10": 0,
          "p25": 0.150359,
          "median": 0.364324,
          "p75": 0.777752,
          "p90": 1.162562,
          "mean": 0.520456,
          "std": 0.50091,
          "direction": "low"
        },
        "ltd_to_equity": {
          "n": 123,
          "p10": 0,
          "p25": 0.026855,
          "median": 0.112928,
          "p75": 0.328177,
          "p90": 0.590688,
          "mean": 0.213716,
          "std": 0.246386,
          "direction": "low"
        },
        "debt_to_capital": {
          "n": 149,
          "p10": 0,
          "p25": 0.164457,
          "median": 0.325884,
          "p75": 0.534596,
          "p90": 0.783203,
          "mean": 0.382655,
          "std": 0.299544,
          "direction": "low"
        },
        "icr": {
          "n": 133,
          "p10": -2.220486,
          "p25": 0,
          "median": 0.672582,
          "p75": 4.968145,
          "p90": 9.967823,
          "mean": 2.388528,
          "std": 4.645034,
          "direction": "high"
        },
        "current_ratio": {
          "n": 151,
          "p10": 0,
          "p25": 0.484395,
          "median": 1.104963,
          "p75": 2.373966,
          "p90": 3.091269,
          "mean": 1.485568,
          "std": 1.294372,
          "direction": "high"
        },
        "quick_ratio": {
          "n": 153,
          "p10": 0,
          "p25": 0.431902,
          "median": 1.011024,
          "p75": 2.179673,
          "p90": 3.039097,
          "mean": 1.384758,
          "std": 1.231649,
          "direction": "high"
        },
        "cash_ratio": {
          "n": 146,
          "p10": 0,
          "p25": 0.036913,
          "median": 0.15429,
          "p75": 0.647,
          "p90": 1.215827,
          "mean": 0.392086,
          "std": 0.491304,
          "direction": "high"
        },
        "cash_turnover": {
          "n": 131,
          "p10": -4.284988,
          "p25": -0.744198,
          "median": 1.648702,
          "p75": 4.56794,
          "p90": 7.117682,
          "mean": 1.6697,
          "std": 4.435357,
          "direction": "high"
        },
        "tato": {
          "n": 148,
          "p10": 0,
          "p25": 0.259493,
          "median": 0.496707,
          "p75": 0.811359,
          "p90": 1.112522,
          "mean": 0.547939,
          "std": 0.406841,
          "direction": "high"
        },
        "fato": {
          "n": 144,
          "p10": 0,
          "p25": 0.324275,
          "median": 0.68892,
          "p75": 1.128436,
          "p90": 1.630742,
          "mean": 0.784093,
          "std": 0.627635,
          "direction": "high"
        },
        "inventory_turnover": {
          "n": 134,
          "p10": 0,
          "p25": 0,
          "median": 10.126382,
          "p75": 28.642531,
          "p90": 67.684188,
          "mean": 23.81749,
          "std": 35.687135,
          "direction": "high"
        },
        "receivable_turnover": {
          "n": 146,
          "p10": 0,
          "p25": 0.274374,
          "median": 1.234169,
          "p75": 2.734859,
          "p90": 3.519548,
          "mean": 1.605328,
          "std": 1.627259,
          "direction": "high"
        },
        "working_capital_turnover": {
          "n": 131,
          "p10": -4.284988,
          "p25": -0.744198,
          "median": 1.648702,
          "p75": 4.56794,
          "p90": 7.117682,
          "mean": 1.6697,
          "std": 4.435357,
          "direction": "high"
        },
        "payable_turnover": {
          "n": 137,
          "p10": 0,
          "p25": 3.292013,
          "median": 9.714237,
          "p75": 20.337737,
          "p90": 38.56952,
          "mean": 14.30368,
          "std": 14.224278,
          "direction": "high"
        }
      }
    },
    "IDX-PROPERTY-REALESTATE": {
      "industry_code": "IDX-PROPERTY-REALESTATE",
      "label": "Property & Real Estate",
      "source_file": "Template_Excel_Analisis_Rasio_Keuangan_Perusahaan_Properti_dan_Real_Estate_2021-2024_â_Profitabilitas,_Likuiditas,_Solvabilitas_(Input_Neraca_&_Laba_Rugi)[1].xlsx",
      "benchmarks": {
        "gpm": {
          "n": 360,
          "p10": 0,
          "p25": 0.232226,
          "median": 0.437596,
          "p75": 0.575442,
          "p90": 0.680313,
          "mean": 0.386171,
          "std": 0.26132,
          "direction": "high"
        },
        "opm": {
          "n": 308,
          "p10": -0.200541,
          "p25": 0,
          "median": 0.072098,
          "p75": 0.257975,
          "p90": 0.400256,
          "mean": 0.107414,
          "std": 0.236869,
          "direction": "high"
        },
        "npm": {
          "n": 307,
          "p10": -0.1989,
          "p25": 0,
          "median": 0.072353,
          "p75": 0.255093,
          "p90": 0.394222,
          "mean": 0.107245,
          "std": 0.228841,
          "direction": "high"
        },
        "roa": {
          "n": 329,
          "p10": -0.027623,
          "p25": -0.003969,
          "median": 0.00338,
          "p75": 0.029914,
          "p90": 0.060267,
          "mean": 0.011576,
          "std": 0.034313,
          "direction": "high"
        },
        "roe": {
          "n": 316,
          "p10": -0.031192,
          "p25": -0.000022,
          "median": 0.008655,
          "p75": 0.052653,
          "p90": 0.094391,
          "mean": 0.022778,
          "std": 0.050356,
          "direction": "high"
        },
        "dar": {
          "n": 362,
          "p10": 0,
          "p25": 0.110667,
          "median": 0.283945,
          "p75": 0.469931,
          "p90": 0.616004,
          "mean": 0.303146,
          "std": 0.233054,
          "direction": "low"
        },
        "der": {
          "n": 337,
          "p10": 0,
          "p25": 0.108751,
          "median": 0.37091,
          "p75": 0.737931,
          "p90": 1.195465,
          "mean": 0.484105,
          "std": 0.471003,
          "direction": "low"
        },
        "ltd_to_equity": {
          "n": 337,
          "p10": 0,
          "p25": 0.009663,
          "median": 0.1123,
          "p75": 0.330158,
          "p90": 0.587258,
          "mean": 0.199664,
          "std": 0.229433,
          "direction": "low"
        },
        "debt_to_capital": {
          "n": 362,
          "p10": 0,
          "p25": 0.110667,
          "median": 0.283945,
          "p75": 0.469931,
          "p90": 0.616004,
          "mean": 0.303146,
          "std": 0.233054,
          "direction": "low"
        },
        "icr": {
          "n": 281,
          "p10": -1.461701,
          "p25": 0,
          "median": 0,
          "p75": 2.151542,
          "p90": 6.260669,
          "mean": 1.320376,
          "std": 3.652751,
          "direction": "high"
        },
        "current_ratio": {
          "n": 323,
          "p10": 0,
          "p25": 0.785954,
          "median": 1.596596,
          "p75": 2.879044,
          "p90": 4.492859,
          "mean": 1.953356,
          "std": 1.660937,
          "direction": "high"
        },
        "quick_ratio": {
          "n": 331,
          "p10": 0,
          "p25": 0.059612,
          "median": 1.214142,
          "p75": 2.432803,
          "p90": 3.579215,
          "mean": 1.574241,
          "std": 1.596761,
          "direction": "high"
        },
        "cash_ratio": {
          "n": 331,
          "p10": 0,
          "p25": 0.031778,
          "median": 0.121858,
          "p75": 0.52128,
          "p90": 1.015455,
          "mean": 0.332709,
          "std": 0.427319,
          "direction": "high"
        },
        "cash_turnover": {
          "n": 319,
          "p10": -0.040789,
          "p25": 0.005212,
          "median": 0.319038,
          "p75": 0.705759,
          "p90": 1.196405,
          "mean": 0.415222,
          "std": 0.552751,
          "direction": "high"
        },
        "tato": {
          "n": 352,
          "p10": 0,
          "p25": 0.035032,
          "median": 0.088188,
          "p75": 0.159713,
          "p90": 0.239075,
          "mean": 0.105706,
          "std": 0.08963,
          "direction": "high"
        },
        "fato": {
          "n": 329,
          "p10": 0,
          "p25": 0.044637,
          "median": 0.123044,
          "p75": 0.270908,
          "p90": 0.490481,
          "mean": 0.187248,
          "std": 0.192032,
          "direction": "high"
        },
        "inventory_turnover": {
          "n": 302,
          "p10": 0,
          "p25": 0,
          "median": 0,
          "p75": 0.03553,
          "p90": 12.428842,
          "mean": 3.274006,
          "std": 9.95885,
          "direction": "high"
        },
        "receivable_turnover": {
          "n": 326,
          "p10": 0,
          "p25": 0,
          "median": 1.310898,
          "p75": 4.230063,
          "p90": 10.542287,
          "mean": 3.209007,
          "std": 4.569315,
          "direction": "high"
        },
        "working_capital_turnover": {
          "n": 319,
          "p10": -0.040789,
          "p25": 0.005212,
          "median": 0.319038,
          "p75": 0.705759,
          "p90": 1.196405,
          "mean": 0.415222,
          "std": 0.552751,
          "direction": "high"
        },
        "payable_turnover": {
          "n": 321,
          "p10": 0,
          "p25": 0,
          "median": 2.971039,
          "p75": 7.821531,
          "p90": 13.698625,
          "mean": 5.076193,
          "std": 6.211566,
          "direction": "high"
        }
      }
    }
  }
};

export const SECTORS = [
  {
    "key": "IDX-BASIC-MATERIALS",
    "label": "Basic Materials",
    "industry_code": "IDX-BASIC-MATERIALS"
  },
  {
    "key": "IDX-CONSUMER-CYCLICALS",
    "label": "Consumer Cyclicals",
    "industry_code": "IDX-CONSUMER-CYCLICALS"
  },
  {
    "key": "IDX-CONSUMER-NON-CYCLICALS",
    "label": "Consumer Non-Cyclicals",
    "industry_code": "IDX-CONSUMER-NON-CYCLICALS"
  },
  {
    "key": "IDX-ENERGY",
    "label": "Energy",
    "industry_code": "IDX-ENERGY"
  },
  {
    "key": "IDX-FINANCIALS",
    "label": "Financials",
    "industry_code": "IDX-FINANCIALS"
  },
  {
    "key": "IDX-INDUSTRIALS",
    "label": "Industrials",
    "industry_code": "IDX-INDUSTRIALS"
  },
  {
    "key": "IDX-INFRASTRUCTURE",
    "label": "Infrastructure",
    "industry_code": "IDX-INFRASTRUCTURE"
  },
  {
    "key": "IDX-HEALTHCARE",
    "label": "Healthcare",
    "industry_code": "IDX-HEALTHCARE"
  },
  {
    "key": "IDX-TECHNOLOGY",
    "label": "Technology",
    "industry_code": "IDX-TECHNOLOGY"
  },
  {
    "key": "IDX-TRANSPORTATION",
    "label": "Transportation & Logistic",
    "industry_code": "IDX-TRANSPORTATION"
  },
  {
    "key": "IDX-PROPERTY-REALESTATE",
    "label": "Property & Real Estate",
    "industry_code": "IDX-PROPERTY-REALESTATE"
  }
];

export function getSector(key) {
     return (INDUSTRY_BENCHMARK.sectors || {})[key] || null;
}

export default INDUSTRY_BENCHMARK;
