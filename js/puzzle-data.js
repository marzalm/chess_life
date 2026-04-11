// puzzle-data.js
//
// Generated from the real Lichess puzzle database by
// tools/extract_lichess_puzzles.py.
// Total puzzles: 176
// Per-theme counts: fork=8, pin=8, skewer=8, discoveredAttack=8, hangingPiece=8, sacrifice=8, trappedPiece=8, attackingF2F7=8, mateIn1=8, mateIn2=8, backRankMate=8, opening=8, middlegame=8, endgame=8, deflection=8, attraction=8, ruyLopez=8, sicilianDefense=8, frenchDefense=8, caroKannDefense=8, italianGame=8, queensPawnGame=8
const PUZZLES = [
  {
    "id": "ruyLopez_1xg3o",
    "fen": "3r2k1/p1p2ppp/1bp5/8/8/2P1R3/PP4PP/RN5K b - - 0 17",
    "solution": [
      "d8d1",
      "e3e1",
      "d1e1"
    ],
    "theme": "ruyLopez",
    "difficulty": 667,
    "source": "lichess:1XG3o"
  },
  {
    "id": "ruyLopez_aljoh",
    "fen": "r2q3r/2pbb1pk/p1np2n1/1p6/3PP2p/1B3Q1P/PP3PP1/R1B2RK1 w - - 4 19",
    "solution": [
      "f3h5"
    ],
    "theme": "ruyLopez",
    "difficulty": 681,
    "source": "lichess:AljOh"
  },
  {
    "id": "ruyLopez_gndyo",
    "fen": "r1b1k1nr/ppp2ppp/2p5/2b1p3/3qP3/2NP1N2/PPP2PPP/R1BQK2R b KQkq - 0 6",
    "solution": [
      "d4f2"
    ],
    "theme": "ruyLopez",
    "difficulty": 780,
    "source": "lichess:GNDyo"
  },
  {
    "id": "ruyLopez_8zqty",
    "fen": "r2qk3/2p1bB1r/p1np4/1p2p1Bn/4P3/2PP1Q1P/PP3P2/RN3RK1 b q - 0 16",
    "solution": [
      "h7f7",
      "f3h5",
      "e7g5"
    ],
    "theme": "ruyLopez",
    "difficulty": 877,
    "source": "lichess:8zqty"
  },
  {
    "id": "ruyLopez_9vqix",
    "fen": "r1b2rk1/pp2Qppp/2p2q2/8/B7/8/PP1P1bPP/RNB1R2K b - - 1 14",
    "solution": [
      "f2e1",
      "e7f6",
      "g7f6"
    ],
    "theme": "ruyLopez",
    "difficulty": 974,
    "source": "lichess:9vQix"
  },
  {
    "id": "ruyLopez_dzxtg",
    "fen": "r1bqk1nr/pp1p1ppp/2p5/7Q/1bB1P3/2pP4/PP3PPP/RNB1K2R w KQkq - 0 9",
    "solution": [
      "h5f7"
    ],
    "theme": "ruyLopez",
    "difficulty": 1007,
    "source": "lichess:DzxTG"
  },
  {
    "id": "ruyLopez_zxkhs",
    "fen": "r3kbr1/2p1q2p/p1Pp1p2/8/p3p3/2P4b/PP1NQPPP/RN3RK1 w q - 2 15",
    "solution": [
      "e2h5",
      "e7f7",
      "h5h3"
    ],
    "theme": "ruyLopez",
    "difficulty": 1101,
    "source": "lichess:ZXKhs"
  },
  {
    "id": "ruyLopez_b3aih",
    "fen": "r1b1kb1N/pppp1ppp/2n5/4q3/2Q5/8/PPPP1P2/RNBK4 w q - 4 12",
    "solution": [
      "c4f7",
      "e8d8",
      "f7f8",
      "e5e8",
      "h8f7"
    ],
    "theme": "ruyLopez",
    "difficulty": 1221,
    "source": "lichess:B3AIh"
  },
  {
    "id": "sicilianDefense_n3ghm",
    "fen": "B4rk1/p2p1pp1/1p1bp2p/2p1q3/2P5/3P4/PPQ1NPPP/R4RK1 b - - 0 16",
    "solution": [
      "e5h2"
    ],
    "theme": "sicilianDefense",
    "difficulty": 725,
    "source": "lichess:n3ghM"
  },
  {
    "id": "sicilianDefense_jcxji",
    "fen": "5rk1/pp3ppp/5b2/q1p1p3/2PrP3/1P6/P1Q2PPP/RN2R1K1 b - - 1 18",
    "solution": [
      "a5e1"
    ],
    "theme": "sicilianDefense",
    "difficulty": 818,
    "source": "lichess:JCxJi"
  },
  {
    "id": "sicilianDefense_fiyam",
    "fen": "r1b3k1/p4p1p/2p2bpB/8/2p1p3/7P/PqPQ1PP1/3RK2R w K - 0 19",
    "solution": [
      "d2d8",
      "f6d8",
      "d1d8"
    ],
    "theme": "sicilianDefense",
    "difficulty": 914,
    "source": "lichess:fiYAM"
  },
  {
    "id": "sicilianDefense_q7zol",
    "fen": "r1bq1rk1/pp2bpp1/3p1n1p/2pN4/2BpP2B/3P3P/PPP2PP1/R2Q1RK1 b - - 1 11",
    "solution": [
      "f6d5",
      "c4d5",
      "e7h4"
    ],
    "theme": "sicilianDefense",
    "difficulty": 959,
    "source": "lichess:Q7ZoL"
  },
  {
    "id": "sicilianDefense_dxswd",
    "fen": "r4rk1/1b2ppbp/p1q2Bp1/1p6/8/2NB4/PPP1QPPP/3R1RK1 b - - 0 15",
    "solution": [
      "c6g2"
    ],
    "theme": "sicilianDefense",
    "difficulty": 984,
    "source": "lichess:dxSwD"
  },
  {
    "id": "sicilianDefense_sksp1",
    "fen": "r2qkb1r/1p2pp1p/2bp2p1/2pN4/1p6/3P4/PPP2PPP/R1BQR1K1 w kq - 2 15",
    "solution": [
      "d5f6"
    ],
    "theme": "sicilianDefense",
    "difficulty": 1141,
    "source": "lichess:sksP1"
  },
  {
    "id": "sicilianDefense_pb4tx",
    "fen": "r1bqk2r/p4ppp/p3pn2/8/1b1PpB2/2N5/PP3PPP/R2QK1NR w KQkq - 0 10",
    "solution": [
      "d1a4",
      "d8d7",
      "a4b4"
    ],
    "theme": "sicilianDefense",
    "difficulty": 1150,
    "source": "lichess:pB4Tx"
  },
  {
    "id": "sicilianDefense_jzvvf",
    "fen": "r2q1rk1/6bp/ppb2pp1/3p1n2/2pP4/2P2NB1/PP2QPPP/RN2R1K1 w - - 2 17",
    "solution": [
      "e2e6",
      "f8f7",
      "e6c6"
    ],
    "theme": "sicilianDefense",
    "difficulty": 1180,
    "source": "lichess:jzVVF"
  },
  {
    "id": "frenchDefense_klgs7",
    "fen": "rn1qk1r1/pppbb1Bp/8/3p1pP1/4p2P/1P6/P1PPQP2/R3KBNR w KQq - 1 11",
    "solution": [
      "e2h5"
    ],
    "theme": "frenchDefense",
    "difficulty": 697,
    "source": "lichess:kLgS7"
  },
  {
    "id": "frenchDefense_mbcqc",
    "fen": "r3q1k1/1pp2ppp/p1n2b2/3N4/3P4/3Q4/PPP2PPP/1K4NR b - - 0 14",
    "solution": [
      "e8e1",
      "d3d1",
      "e1d1"
    ],
    "theme": "frenchDefense",
    "difficulty": 830,
    "source": "lichess:MBCqc"
  },
  {
    "id": "frenchDefense_g0pz9",
    "fen": "r1b1k2r/2qp1pp1/pp2p1p1/8/8/4N3/PPP1QPP1/R1B1R1K1 b kq - 0 17",
    "solution": [
      "c7h2",
      "g1f1",
      "h2h1"
    ],
    "theme": "frenchDefense",
    "difficulty": 868,
    "source": "lichess:g0pz9"
  },
  {
    "id": "frenchDefense_exy9k",
    "fen": "r3k2r/pp1b2pp/4pn2/1N2n3/8/3BN3/PPP2PPP/2KR3R b kq - 4 14",
    "solution": [
      "e5d3",
      "d1d3",
      "d7b5"
    ],
    "theme": "frenchDefense",
    "difficulty": 876,
    "source": "lichess:exy9K"
  },
  {
    "id": "frenchDefense_7gfj8",
    "fen": "r4rk1/pp3p1p/5Q2/8/1n6/qP3P2/P1P3PP/1K1R1BNR b - - 0 18",
    "solution": [
      "a3a2",
      "b1c1",
      "a2c2"
    ],
    "theme": "frenchDefense",
    "difficulty": 998,
    "source": "lichess:7GFj8"
  },
  {
    "id": "frenchDefense_vroeb",
    "fen": "rnb1kbnr/2p2ppp/p3p3/1p2P3/3q4/3B4/PP3PPP/RNBQK1NR w KQkq - 0 7",
    "solution": [
      "d3b5",
      "a6b5",
      "d1d4"
    ],
    "theme": "frenchDefense",
    "difficulty": 1032,
    "source": "lichess:vRoEb"
  },
  {
    "id": "frenchDefense_rb3wd",
    "fen": "r5k1/pb2qp2/1p2pn1Q/2p1R3/2P5/3r1P2/P1P3PP/R5K1 w - - 0 20",
    "solution": [
      "e5g5"
    ],
    "theme": "frenchDefense",
    "difficulty": 1159,
    "source": "lichess:RB3WD"
  },
  {
    "id": "frenchDefense_7pigv",
    "fen": "r3r2k/pp2bp1q/2n2n1Q/3pN3/2pP4/2N3RP/PPP2PP1/3R2K1 w - - 5 19",
    "solution": [
      "e5f7"
    ],
    "theme": "frenchDefense",
    "difficulty": 1192,
    "source": "lichess:7PIGV"
  },
  {
    "id": "caroKannDefense_mmh3q",
    "fen": "r1bqk2r/pp1n1pp1/2n1p2p/3pP1NQ/3b3P/2PB4/PP3PP1/RN2K2R w KQkq - 0 13",
    "solution": [
      "h5f7"
    ],
    "theme": "caroKannDefense",
    "difficulty": 619,
    "source": "lichess:mmh3Q"
  },
  {
    "id": "caroKannDefense_4c1ni",
    "fen": "5rk1/1r3ppp/2nb1q2/p2N4/8/4QP2/PPPB1P1P/2KR3R b - - 0 18",
    "solution": [
      "f6b2"
    ],
    "theme": "caroKannDefense",
    "difficulty": 701,
    "source": "lichess:4C1NI"
  },
  {
    "id": "caroKannDefense_lq4e2",
    "fen": "4rrk1/1pq2ppp/p1nbp3/3p2N1/1P1Pb1P1/2P4P/P2BBP2/R2Q1RK1 b - - 1 18",
    "solution": [
      "d6h2"
    ],
    "theme": "caroKannDefense",
    "difficulty": 734,
    "source": "lichess:lq4E2"
  },
  {
    "id": "caroKannDefense_cgse9",
    "fen": "r3k2r/pp4pp/1qp1p2n/3pP2P/5PP1/1P1B4/P1PB4/R2QK1bR b KQkq - 1 16",
    "solution": [
      "b6f2"
    ],
    "theme": "caroKannDefense",
    "difficulty": 880,
    "source": "lichess:cgSE9"
  },
  {
    "id": "caroKannDefense_0zob0",
    "fen": "r2qkb1r/pp2nppp/2n1p3/1B1pP3/3P4/5N1P/PP3PP1/R1BQK2R b KQkq - 0 10",
    "solution": [
      "d8a5",
      "c1d2",
      "a5b5"
    ],
    "theme": "caroKannDefense",
    "difficulty": 903,
    "source": "lichess:0zOb0"
  },
  {
    "id": "caroKannDefense_qjz55",
    "fen": "r2qk2r/pp3pp1/2pbpn1p/4Q3/3P1B2/5N2/PPP2PPP/2KR3R w kq - 4 13",
    "solution": [
      "e5d6",
      "d8d6",
      "f4d6"
    ],
    "theme": "caroKannDefense",
    "difficulty": 1008,
    "source": "lichess:qJZ55"
  },
  {
    "id": "caroKannDefense_cz5lf",
    "fen": "r2qk2r/pp1n1pp1/4p2p/3pN3/3P1QPP/8/PPP1B3/2KR3n w kq - 0 17",
    "solution": [
      "f4f7"
    ],
    "theme": "caroKannDefense",
    "difficulty": 1124,
    "source": "lichess:Cz5lf"
  },
  {
    "id": "caroKannDefense_d82o2",
    "fen": "2r3rk/1p3ppp/p1n2n1B/3p2Q1/1b1P4/1BN2P1q/PP3P2/2KR2R1 w - - 0 18",
    "solution": [
      "h6g7",
      "g8g7",
      "g5g7"
    ],
    "theme": "caroKannDefense",
    "difficulty": 1233,
    "source": "lichess:D82o2"
  },
  {
    "id": "italianGame_qplfg",
    "fen": "r1bq3k/1pp1n3/p1np3p/7Q/P1BbP3/8/1P3PPP/RN3RK1 w - - 0 15",
    "solution": [
      "h5h6"
    ],
    "theme": "italianGame",
    "difficulty": 656,
    "source": "lichess:QPLFg"
  },
  {
    "id": "italianGame_agri3",
    "fen": "r1b1q1k1/p2p1Bp1/3P1nQp/1pp5/8/4P3/PPP3PP/R4RK1 b - - 0 17",
    "solution": [
      "e8f7",
      "g6f7",
      "g8f7"
    ],
    "theme": "italianGame",
    "difficulty": 766,
    "source": "lichess:AGRi3"
  },
  {
    "id": "italianGame_cyvcd",
    "fen": "r1b2Bk1/pp3ppp/1bp5/3Pq3/2B5/1QP2PP1/P5P1/RN3R1K b - - 0 16",
    "solution": [
      "e5h5"
    ],
    "theme": "italianGame",
    "difficulty": 845,
    "source": "lichess:CYvcD"
  },
  {
    "id": "italianGame_m5sb6",
    "fen": "r4rk1/p1p3pp/2p5/2bp4/4n3/2P5/PP1N2PP/R1BQ2RK b - - 0 17",
    "solution": [
      "e4f2"
    ],
    "theme": "italianGame",
    "difficulty": 860,
    "source": "lichess:m5Sb6"
  },
  {
    "id": "italianGame_9piiz",
    "fen": "3r1k2/ppp3p1/5q1p/2p5/3nPP2/2QP3P/PPP3P1/2KR3R b - - 2 18",
    "solution": [
      "d4e2",
      "c1d2",
      "e2c3"
    ],
    "theme": "italianGame",
    "difficulty": 938,
    "source": "lichess:9pIiZ"
  },
  {
    "id": "italianGame_zfqf3",
    "fen": "r4rk1/ppp2pp1/3p4/2b1pNp1/2B1P1n1/3P4/PPP2PP1/R4K1R w - - 0 15",
    "solution": [
      "f5e7"
    ],
    "theme": "italianGame",
    "difficulty": 1003,
    "source": "lichess:zFQf3"
  },
  {
    "id": "italianGame_zswkv",
    "fen": "r1bqkb1r/ppp1n3/3p2pp/3Npp1Q/2B1P3/3P4/PPPN1PPP/R3K2R w KQkq - 0 11",
    "solution": [
      "d5f6"
    ],
    "theme": "italianGame",
    "difficulty": 1073,
    "source": "lichess:ZSwKV"
  },
  {
    "id": "italianGame_tqqnm",
    "fen": "r1bq3r/ppp2pk1/2np4/4p1PQ/2B1P1n1/2NP4/PPP2PP1/R3K2R w KQ - 1 15",
    "solution": [
      "h5f7"
    ],
    "theme": "italianGame",
    "difficulty": 1258,
    "source": "lichess:TQQNm"
  },
  {
    "id": "queensPawnGame_h5n7d",
    "fen": "rn1qkbnr/ppp2ppp/4p1b1/3p4/3P1BP1/5P1P/PPPNP3/R2QKBNR b KQkq - 1 6",
    "solution": [
      "d8h4",
      "f4g3",
      "h4g3"
    ],
    "theme": "queensPawnGame",
    "difficulty": 870,
    "source": "lichess:H5n7D"
  },
  {
    "id": "queensPawnGame_y3ynf",
    "fen": "r1bq4/ppp5/1kn2n2/6Q1/3p4/2N1P3/PPr2PPP/R3K1NR w KQ - 2 19",
    "solution": [
      "g5b5"
    ],
    "theme": "queensPawnGame",
    "difficulty": 877,
    "source": "lichess:Y3ynF"
  },
  {
    "id": "queensPawnGame_lk2gr",
    "fen": "2kr1b1N/pp2p1p1/2p5/5q1p/3P2n1/2P3P1/PP3P2/R1BQR1K1 b - - 0 19",
    "solution": [
      "f5f2",
      "g1h1",
      "f2h2"
    ],
    "theme": "queensPawnGame",
    "difficulty": 890,
    "source": "lichess:lK2gr"
  },
  {
    "id": "queensPawnGame_cznna",
    "fen": "r3k2r/ppq2pp1/2p1p3/2b4p/4NPn1/P3P2P/1PPQ2P1/R1B2RK1 b kq - 1 18",
    "solution": [
      "c5e3",
      "d2e3",
      "g4e3"
    ],
    "theme": "queensPawnGame",
    "difficulty": 927,
    "source": "lichess:cZnNa"
  },
  {
    "id": "queensPawnGame_tfij8",
    "fen": "r2qkb1r/ppp2ppp/2n5/2Pp4/3Pn3/4PP2/PP2B2P/RNBQK2R b KQkq - 0 9",
    "solution": [
      "d8h4",
      "e1f1",
      "h4f2"
    ],
    "theme": "queensPawnGame",
    "difficulty": 990,
    "source": "lichess:TFIj8"
  },
  {
    "id": "queensPawnGame_qmjfp",
    "fen": "r2r2k1/ppq2pp1/2n2n2/3p2B1/8/1NP2B2/PPQ4b/2R1R1K1 w - - 0 20",
    "solution": [
      "c2h2",
      "c7h2",
      "g1h2"
    ],
    "theme": "queensPawnGame",
    "difficulty": 1038,
    "source": "lichess:qMJFP"
  },
  {
    "id": "queensPawnGame_a7mmy",
    "fen": "3rkb1r/p2npppp/2B5/1Np5/5B2/P5P1/1Pb1PP1P/4K1NR w Kk - 2 17",
    "solution": [
      "b5c7"
    ],
    "theme": "queensPawnGame",
    "difficulty": 1063,
    "source": "lichess:A7mmy"
  },
  {
    "id": "queensPawnGame_cg4ll",
    "fen": "r4rk1/ppbn1ppp/2p1n3/4P3/3N1B2/1P4PP/P1P2P2/3RR1K1 w - - 1 19",
    "solution": [
      "d4e6",
      "f7e6",
      "d1d7"
    ],
    "theme": "queensPawnGame",
    "difficulty": 1100,
    "source": "lichess:cG4ll"
  },
  {
    "id": "deflection_hhyqr",
    "fen": "4r1k1/p4ppp/1pN5/3P4/4n3/8/R1P2PPP/4RK2 b - - 0 28",
    "solution": [
      "e4d2",
      "f1g1",
      "e8e1"
    ],
    "theme": "deflection",
    "difficulty": 882,
    "source": "lichess:hHYqr"
  },
  {
    "id": "deflection_s5csf",
    "fen": "8/5kp1/1R5p/8/6PK/r6P/P2R4/8 b - - 4 54",
    "solution": [
      "g7g5",
      "h4h5",
      "a3h3"
    ],
    "theme": "deflection",
    "difficulty": 928,
    "source": "lichess:S5cSf"
  },
  {
    "id": "deflection_vb0mz",
    "fen": "2r1q1k1/3n1ppp/p1N2n2/1p1p1P2/1P3Q2/P4B1P/6PK/2R5 w - - 3 30",
    "solution": [
      "c6e7",
      "e8e7",
      "c1c8"
    ],
    "theme": "deflection",
    "difficulty": 936,
    "source": "lichess:vb0mZ"
  },
  {
    "id": "deflection_vaznh",
    "fen": "6k1/p4pp1/1qN4p/1p6/4QP2/6P1/6KP/3n1B2 b - - 3 39",
    "solution": [
      "b6f2",
      "g2h3",
      "f2f1"
    ],
    "theme": "deflection",
    "difficulty": 949,
    "source": "lichess:VAznh"
  },
  {
    "id": "deflection_a5uu4",
    "fen": "8/8/2k5/3p4/8/1PB5/1KP2n2/8 b - - 4 39",
    "solution": [
      "f2d1",
      "b2a3",
      "d1c3"
    ],
    "theme": "deflection",
    "difficulty": 962,
    "source": "lichess:a5UU4"
  },
  {
    "id": "deflection_5psl5",
    "fen": "8/2R4p/7k/2p3p1/8/P6K/1P1R3P/2r3r1 w - - 0 41",
    "solution": [
      "d2d6",
      "h6h5",
      "c7h7"
    ],
    "theme": "deflection",
    "difficulty": 1036,
    "source": "lichess:5pSl5"
  },
  {
    "id": "deflection_j4jps",
    "fen": "r2qr3/p2p1pk1/1p3bpp/1BpQN3/8/8/PPP2PPP/4R1K1 w - - 5 20",
    "solution": [
      "d5f7",
      "g7h8",
      "e5g6"
    ],
    "theme": "deflection",
    "difficulty": 1084,
    "source": "lichess:J4jps"
  },
  {
    "id": "deflection_bmyu9",
    "fen": "6k1/3b1pp1/2p1pb1p/3p4/1q1P4/3BPNP1/5PP1/Q5K1 w - - 0 28",
    "solution": [
      "a1a8",
      "b4f8",
      "d3h7",
      "g8h7",
      "a8f8"
    ],
    "theme": "deflection",
    "difficulty": 1108,
    "source": "lichess:bMyU9"
  },
  {
    "id": "attraction_huc0n",
    "fen": "Q4Q2/1p6/pkpr4/8/8/5pP1/1P3P2/3q1BK1 b - - 0 35",
    "solution": [
      "d1f1",
      "g1f1",
      "d6d1"
    ],
    "theme": "attraction",
    "difficulty": 842,
    "source": "lichess:HUc0n"
  },
  {
    "id": "attraction_kbj2y",
    "fen": "k2r3r/ppp2pq1/2N2p2/7p/2P4P/1Q6/PP3KB1/R3R3 b - - 0 22",
    "solution": [
      "d8d2",
      "e1e2",
      "d2e2",
      "f2e2",
      "g7g2"
    ],
    "theme": "attraction",
    "difficulty": 880,
    "source": "lichess:Kbj2Y"
  },
  {
    "id": "attraction_kcphy",
    "fen": "4r1k1/p4p1p/1pb3pB/2p5/2P3B1/1Pb5/P1R2PPP/4rRK1 b - - 2 24",
    "solution": [
      "e1f1",
      "g1f1",
      "e8e1"
    ],
    "theme": "attraction",
    "difficulty": 913,
    "source": "lichess:kCpHY"
  },
  {
    "id": "attraction_t4afv",
    "fen": "4k3/ppp1Prb1/3q2p1/7p/2Q5/2P5/PPP2PPP/4RK2 w - - 3 27",
    "solution": [
      "c4f7",
      "e8f7",
      "e7e8q"
    ],
    "theme": "attraction",
    "difficulty": 926,
    "source": "lichess:T4aFV"
  },
  {
    "id": "attraction_kqdb8",
    "fen": "5nkr/p3B3/qr2p1p1/3pP3/3P2Q1/1RP4P/1R1K1P2/8 b - - 1 31",
    "solution": [
      "b6b3",
      "b2b3",
      "a6a2",
      "d2e3",
      "a2b3"
    ],
    "theme": "attraction",
    "difficulty": 985,
    "source": "lichess:kQDB8"
  },
  {
    "id": "attraction_ywk24",
    "fen": "5rk1/5ppp/p7/1rQ2b2/q1p5/2P2N2/PP1R2PP/K3R3 w - - 1 27",
    "solution": [
      "c5f8",
      "g8f8",
      "d2d8"
    ],
    "theme": "attraction",
    "difficulty": 1032,
    "source": "lichess:YWk24"
  },
  {
    "id": "attraction_96ldj",
    "fen": "2b2r1k/p3Nppp/8/8/4p3/8/rPP2PP1/2KR3R w - - 2 21",
    "solution": [
      "h1h7",
      "h8h7",
      "d1h1",
      "c8h3",
      "h1h3"
    ],
    "theme": "attraction",
    "difficulty": 1162,
    "source": "lichess:96lDj"
  },
  {
    "id": "attraction_zrtnj",
    "fen": "5rk1/3pQp1p/4pPp1/r7/4q3/1b5P/5PP1/2R3K1 w - - 0 25",
    "solution": [
      "e7f8",
      "g8f8",
      "c1c8"
    ],
    "theme": "attraction",
    "difficulty": 1209,
    "source": "lichess:zRtNJ"
  },
  {
    "id": "attackingF2F7_tsnqy",
    "fen": "r4rk1/ppp3pp/2n2q2/3pp2P/6Q1/2NP4/PPP2PP1/3RK2R b K - 2 14",
    "solution": [
      "f6f2"
    ],
    "theme": "attackingF2F7",
    "difficulty": 610,
    "source": "lichess:TsNQy"
  },
  {
    "id": "attackingF2F7_dy20d",
    "fen": "rnb1k1nr/ppp2ppp/1q1p4/2b5/8/P1N2N2/1BPPPPPP/1R1QKB1R b Kkq - 4 8",
    "solution": [
      "c5f2"
    ],
    "theme": "attackingF2F7",
    "difficulty": 776,
    "source": "lichess:DY20d"
  },
  {
    "id": "attackingF2F7_1yuka",
    "fen": "r1b1kb1r/pp3ppp/2N1p3/2qp4/4n3/P1N5/1PPBPPPP/R2QKB1R b KQkq - 0 9",
    "solution": [
      "c5f2"
    ],
    "theme": "attackingF2F7",
    "difficulty": 800,
    "source": "lichess:1YUKA"
  },
  {
    "id": "attackingF2F7_lytua",
    "fen": "rn2k2r/ppp2ppp/4bn2/2b5/2Pq4/2N2N2/PP1PBPPP/R1BQK2R b KQkq - 5 7",
    "solution": [
      "d4f2"
    ],
    "theme": "attackingF2F7",
    "difficulty": 890,
    "source": "lichess:LYtUA"
  },
  {
    "id": "attackingF2F7_kxkv4",
    "fen": "r1b1kbnr/1pq1pppp/2n5/1p1pN3/3P4/5Q2/PPP2PPP/RNB1K2R w KQkq - 0 8",
    "solution": [
      "f3f7",
      "e8d8",
      "f7f8"
    ],
    "theme": "attackingF2F7",
    "difficulty": 961,
    "source": "lichess:kXKv4"
  },
  {
    "id": "attackingF2F7_jacoz",
    "fen": "1n1qk2r/1p3ppp/3p1n2/2p1p3/4P3/r2P1Q1P/B1P1NPP1/R3K2R w KQk - 0 15",
    "solution": [
      "a2f7",
      "e8f7",
      "a1a3"
    ],
    "theme": "attackingF2F7",
    "difficulty": 1051,
    "source": "lichess:JACOZ"
  },
  {
    "id": "attackingF2F7_4vlfz",
    "fen": "r2qkbnr/1pp2pp1/p1np3p/4p3/P1B1P3/1QP2b2/1P1P1PPP/RNB2RK1 w kq - 0 8",
    "solution": [
      "c4f7",
      "e8d7",
      "b3e6"
    ],
    "theme": "attackingF2F7",
    "difficulty": 1096,
    "source": "lichess:4vlFZ"
  },
  {
    "id": "attackingF2F7_o3xqh",
    "fen": "r1bqk2r/p1p1bppp/2p5/4N1B1/3pn3/3P1Q2/PPP2PPP/R3K2R w KQkq - 0 11",
    "solution": [
      "f3f7"
    ],
    "theme": "attackingF2F7",
    "difficulty": 1116,
    "source": "lichess:o3xQH"
  },
  {
    "id": "trappedPiece_mhb5l",
    "fen": "2Q3k1/5ppp/pq1rp3/1pb5/8/2P2N2/PP3PPP/5RK1 b - - 5 22",
    "solution": [
      "d6d8",
      "c8d8",
      "b6d8"
    ],
    "theme": "trappedPiece",
    "difficulty": 745,
    "source": "lichess:mhb5l"
  },
  {
    "id": "trappedPiece_2kj2m",
    "fen": "1rr2k2/pp1b1p1p/2p3p1/P1RpP3/1P1P1P2/2R1P3/6BP/6K1 b - - 0 31",
    "solution": [
      "b7b6",
      "c3b3",
      "b6c5"
    ],
    "theme": "trappedPiece",
    "difficulty": 917,
    "source": "lichess:2kJ2m"
  },
  {
    "id": "trappedPiece_zb9ow",
    "fen": "4nk2/1p2b1p1/1q5p/p1p5/P4B2/2P3N1/1P3PPP/Rb1BR1K1 b - - 2 25",
    "solution": [
      "b6b2",
      "a1b1",
      "b2b1"
    ],
    "theme": "trappedPiece",
    "difficulty": 930,
    "source": "lichess:Zb9oW"
  },
  {
    "id": "trappedPiece_ijkyf",
    "fen": "1r3rk1/pp1nbppp/2p1p3/4P3/3P4/2Q3P1/qP1N1PBP/1R3RK1 w - - 3 16",
    "solution": [
      "b1a1",
      "a2a1",
      "f1a1"
    ],
    "theme": "trappedPiece",
    "difficulty": 950,
    "source": "lichess:IjKyf"
  },
  {
    "id": "trappedPiece_ooni1",
    "fen": "r2qk1nr/p1p1b1Qp/2Pp4/5bp1/4p2P/8/PPP1PP2/RNB1K1NR b KQkq - 0 10",
    "solution": [
      "e7f6",
      "c1g5",
      "f6g7"
    ],
    "theme": "trappedPiece",
    "difficulty": 996,
    "source": "lichess:Ooni1"
  },
  {
    "id": "trappedPiece_j0vdn",
    "fen": "2r5/1p2ppbp/p1k3p1/P2p4/2rP4/2P1B3/1PK2PPP/3R3R w - - 1 19",
    "solution": [
      "b2b3",
      "c4c3",
      "c2c3"
    ],
    "theme": "trappedPiece",
    "difficulty": 1071,
    "source": "lichess:j0VdN"
  },
  {
    "id": "trappedPiece_peot4",
    "fen": "5k1r/p1p2p2/2p4p/1p3P2/5PPr/2PP4/P5K1/3R1R2 w - - 2 32",
    "solution": [
      "g2g3",
      "h4g4",
      "g3g4"
    ],
    "theme": "trappedPiece",
    "difficulty": 1160,
    "source": "lichess:peot4"
  },
  {
    "id": "trappedPiece_2pqxb",
    "fen": "2r4k/6pp/p2p1Q2/1p1B2n1/3B4/4P2P/PPP3P1/4q2K w - - 9 32",
    "solution": [
      "h1h2",
      "e1g3",
      "h2g3",
      "g5e4",
      "d5e4"
    ],
    "theme": "trappedPiece",
    "difficulty": 1181,
    "source": "lichess:2pQxb"
  },
  {
    "id": "discoveredAttack_efro7",
    "fen": "7r/5k2/p3pp2/1p1p4/2pP1q2/P1P2B1P/1P4K1/5RR1 w - - 2 38",
    "solution": [
      "f3h5",
      "h8h5",
      "f1f4"
    ],
    "theme": "discoveredAttack",
    "difficulty": 652,
    "source": "lichess:eFrO7"
  },
  {
    "id": "discoveredAttack_b4pvt",
    "fen": "4r1k1/1p3qp1/p1p3r1/3p1p1Q/N2P3P/4P1P1/1P3P2/1R2R1K1 b - - 0 30",
    "solution": [
      "g6g3",
      "f2g3",
      "f7h5"
    ],
    "theme": "discoveredAttack",
    "difficulty": 785,
    "source": "lichess:B4PVt"
  },
  {
    "id": "discoveredAttack_cj5is",
    "fen": "3r2k1/8/1B3p1p/1p2bPpP/p3p1P1/P1Pb3K/1P1R4/3R4 b - - 3 40",
    "solution": [
      "d3f1",
      "d1f1",
      "d8d2"
    ],
    "theme": "discoveredAttack",
    "difficulty": 816,
    "source": "lichess:Cj5iS"
  },
  {
    "id": "discoveredAttack_ragew",
    "fen": "7k/1p4p1/p1p4p/5Q2/1P2R2P/P2n2PK/1q6/8 b - - 2 51",
    "solution": [
      "d3f2",
      "h3g2",
      "f2e4"
    ],
    "theme": "discoveredAttack",
    "difficulty": 919,
    "source": "lichess:RaGeW"
  },
  {
    "id": "discoveredAttack_aawdx",
    "fen": "6k1/7p/3Np1p1/3p4/8/3nP1P1/2R2PKP/1r6 b - - 8 34",
    "solution": [
      "d3e1",
      "g2f1",
      "e1c2"
    ],
    "theme": "discoveredAttack",
    "difficulty": 957,
    "source": "lichess:AAwdx"
  },
  {
    "id": "discoveredAttack_qn0hl",
    "fen": "8/5k2/p4b2/3p1p2/P6p/1p4qP/2r2NQ1/6RK w - - 6 53",
    "solution": [
      "g2d5",
      "f7e7",
      "g1g3"
    ],
    "theme": "discoveredAttack",
    "difficulty": 1082,
    "source": "lichess:qN0hL"
  },
  {
    "id": "discoveredAttack_ombmc",
    "fen": "8/p3k2p/2p2np1/3b1p2/5P2/2r3P1/P3K2P/3RR3 w - - 3 25",
    "solution": [
      "e2d2",
      "f6e4",
      "e1e4",
      "f5e4",
      "d2c3"
    ],
    "theme": "discoveredAttack",
    "difficulty": 1233,
    "source": "lichess:oMbmC"
  },
  {
    "id": "discoveredAttack_ncbxz",
    "fen": "5B2/1kp5/ppn1q3/1r3p2/2NP2p1/1Q2P3/PP3P2/2K5 w - - 2 30",
    "solution": [
      "c4a5",
      "b5a5",
      "b3e6"
    ],
    "theme": "discoveredAttack",
    "difficulty": 1288,
    "source": "lichess:ncBXZ"
  },
  {
    "id": "skewer_vwbsl",
    "fen": "8/3R3p/5ppk/8/3K1P2/4P3/6rP/8 b - - 0 33",
    "solution": [
      "g2d2",
      "d4c5",
      "d2d7"
    ],
    "theme": "skewer",
    "difficulty": 866,
    "source": "lichess:vWbsl"
  },
  {
    "id": "skewer_ag1fz",
    "fen": "8/2k5/4K2R/r3P3/8/8/8/8 b - - 0 56",
    "solution": [
      "a5a6",
      "e6f5",
      "a6h6"
    ],
    "theme": "skewer",
    "difficulty": 914,
    "source": "lichess:AG1fZ"
  },
  {
    "id": "skewer_efeqd",
    "fen": "8/8/4p1p1/5p1p/5P1P/r3k1P1/P4RK1/8 w - - 0 44",
    "solution": [
      "f2f3",
      "e3e4",
      "f3a3"
    ],
    "theme": "skewer",
    "difficulty": 934,
    "source": "lichess:eFeqd"
  },
  {
    "id": "skewer_hfdfe",
    "fen": "8/5pk1/1PR3p1/8/5PP1/2K5/8/5r2 b - - 0 36",
    "solution": [
      "f1c1",
      "c3b4",
      "c1c6"
    ],
    "theme": "skewer",
    "difficulty": 976,
    "source": "lichess:HfDFE"
  },
  {
    "id": "skewer_n49sa",
    "fen": "3k4/5R2/2P3p1/7p/7P/5KP1/8/2r5 b - - 0 50",
    "solution": [
      "c1f1",
      "f3e2",
      "f1f7"
    ],
    "theme": "skewer",
    "difficulty": 977,
    "source": "lichess:n49sa"
  },
  {
    "id": "skewer_bmymp",
    "fen": "8/p5pp/5b2/8/2k5/5B1P/r5P1/3R2K1 w - - 2 39",
    "solution": [
      "f3d5",
      "c4c5",
      "d5a2"
    ],
    "theme": "skewer",
    "difficulty": 1019,
    "source": "lichess:BMYMP"
  },
  {
    "id": "skewer_igjne",
    "fen": "5Q2/8/8/1p4K1/k6p/7P/8/q7 w - - 1 49",
    "solution": [
      "f8a8",
      "a4b3",
      "a8a1"
    ],
    "theme": "skewer",
    "difficulty": 1043,
    "source": "lichess:igjnE"
  },
  {
    "id": "skewer_oihlo",
    "fen": "6r1/p3p3/2p1P3/3pP2k/PP2bP2/1N5p/5K2/7R w - - 4 53",
    "solution": [
      "h1h3",
      "h5g4",
      "h3g3",
      "g4f4",
      "g3g8"
    ],
    "theme": "skewer",
    "difficulty": 1062,
    "source": "lichess:OihLO"
  },
  {
    "id": "pin_lmghq",
    "fen": "8/p7/rp5R/8/4k3/2p4P/2N3K1/8 b - - 3 57",
    "solution": [
      "a6a2",
      "g2g3",
      "a2c2"
    ],
    "theme": "pin",
    "difficulty": 926,
    "source": "lichess:LMghq"
  },
  {
    "id": "pin_lggg6",
    "fen": "7k/1p5p/p3n1pQ/4n3/4P3/2N3qP/PPP3P1/5BK1 b - - 1 33",
    "solution": [
      "e5f3",
      "g1h1",
      "g3h2"
    ],
    "theme": "pin",
    "difficulty": 943,
    "source": "lichess:lGGg6"
  },
  {
    "id": "pin_tzqex",
    "fen": "2r1b1k1/6pp/p2pPp2/1ppQ4/3p1PPq/P2P3P/1PP3K1/1R3R2 b - - 1 24",
    "solution": [
      "e8c6",
      "d5c6",
      "c8c6"
    ],
    "theme": "pin",
    "difficulty": 947,
    "source": "lichess:Tzqex"
  },
  {
    "id": "pin_ejhpt",
    "fen": "8/p1pR2pk/2p3pb/8/6N1/3K3P/6r1/8 w - - 0 38",
    "solution": [
      "g4f6",
      "h7h8",
      "d7d8"
    ],
    "theme": "pin",
    "difficulty": 949,
    "source": "lichess:EjHPT"
  },
  {
    "id": "pin_xamus",
    "fen": "k3r3/1pq5/p5p1/8/2PB3P/1P4b1/P2R2P1/1K1Q4 b - - 0 33",
    "solution": [
      "e8e1",
      "d1e1",
      "g3e1"
    ],
    "theme": "pin",
    "difficulty": 997,
    "source": "lichess:xaMUS"
  },
  {
    "id": "pin_hii8h",
    "fen": "3q2r1/p4p1k/b1p1pPr1/1p4R1/3PB3/2P3P1/P4P1P/1R4K1 w - - 0 30",
    "solution": [
      "g5h5"
    ],
    "theme": "pin",
    "difficulty": 1044,
    "source": "lichess:hii8h"
  },
  {
    "id": "pin_ee0li",
    "fen": "r2qr2k/1bp3bp/p5p1/1p3p2/3n3N/1B5Q/PP1N1PPP/2R2RK1 w - - 0 19",
    "solution": [
      "h4g6"
    ],
    "theme": "pin",
    "difficulty": 1053,
    "source": "lichess:Ee0lI"
  },
  {
    "id": "pin_19rbx",
    "fen": "2Q5/4rk1p/1p3pp1/1B1qp3/P7/8/5PPP/6K1 w - - 1 35",
    "solution": [
      "b5c4",
      "d5c4",
      "c8c4"
    ],
    "theme": "pin",
    "difficulty": 1207,
    "source": "lichess:19RBX"
  },
  {
    "id": "fork_4xqzn",
    "fen": "8/1b3kpp/4pp2/pp1r4/2R2P2/P3B2P/4K1P1/8 w - - 0 28",
    "solution": [
      "c4c7",
      "f7g8",
      "c7b7"
    ],
    "theme": "fork",
    "difficulty": 859,
    "source": "lichess:4XqZn"
  },
  {
    "id": "fork_qtz8s",
    "fen": "8/2p5/1p6/2pp1kpp/8/P2P1KPN/1P5P/8 b - - 0 39",
    "solution": [
      "g5g4",
      "f3g2",
      "g4h3"
    ],
    "theme": "fork",
    "difficulty": 898,
    "source": "lichess:qtz8s"
  },
  {
    "id": "fork_otsga",
    "fen": "1N6/4rk1p/1p1Q2p1/2p2p1n/P1P5/6PP/5bBK/8 b - - 5 42",
    "solution": [
      "f2g3",
      "d6g3",
      "h5g3"
    ],
    "theme": "fork",
    "difficulty": 961,
    "source": "lichess:otSGa"
  },
  {
    "id": "fork_azybu",
    "fen": "2r1q3/2p2rkp/p5p1/P1nPN3/2P1Pp2/1PQ2RnP/2B3P1/5RK1 b - - 0 32",
    "solution": [
      "g3e2",
      "g1h2",
      "e2c3"
    ],
    "theme": "fork",
    "difficulty": 973,
    "source": "lichess:azYBu"
  },
  {
    "id": "fork_nke4o",
    "fen": "1rb2r2/1p5k/1R5b/4p3/P1p5/2N2P2/1P2N1PP/5RK1 b - - 0 26",
    "solution": [
      "h6e3",
      "g1h1",
      "e3b6"
    ],
    "theme": "fork",
    "difficulty": 998,
    "source": "lichess:Nke4O"
  },
  {
    "id": "fork_dlj0i",
    "fen": "r2qr1k1/p4p1p/b1p3pB/4p3/3bB3/1R6/P1P2PPP/1R1Q2K1 w - - 2 19",
    "solution": [
      "e4c6",
      "a8c8",
      "c6e8"
    ],
    "theme": "fork",
    "difficulty": 1010,
    "source": "lichess:dlj0i"
  },
  {
    "id": "fork_guqok",
    "fen": "2r2k1r/ppp3p1/7p/2N1p3/5q2/1B3P2/P2R1PKP/2R5 w - - 5 24",
    "solution": [
      "c5e6",
      "f8e7",
      "e6f4"
    ],
    "theme": "fork",
    "difficulty": 1083,
    "source": "lichess:GuQoK"
  },
  {
    "id": "fork_5zj5a",
    "fen": "6k1/3b1pp1/3p2qp/Qp2p3/4P3/3P1N2/2r2PPP/5R1K w - - 0 22",
    "solution": [
      "a5d8",
      "g8h7",
      "d8d7"
    ],
    "theme": "fork",
    "difficulty": 1114,
    "source": "lichess:5zj5a"
  },
  {
    "id": "sacrifice_kpwpy",
    "fen": "1r4k1/5ppp/8/3p4/2p1Q3/1q5P/5PP1/4R1K1 w - - 0 28",
    "solution": [
      "e4e8",
      "b8e8",
      "e1e8"
    ],
    "theme": "sacrifice",
    "difficulty": 664,
    "source": "lichess:KPwpY"
  },
  {
    "id": "sacrifice_53pa9",
    "fen": "5rk1/1p5p/3Q2p1/p4q2/8/P2P4/1P3PPP/2R3K1 b - - 6 33",
    "solution": [
      "f5f2",
      "g1h1",
      "f2f1",
      "c1f1",
      "f8f1"
    ],
    "theme": "sacrifice",
    "difficulty": 690,
    "source": "lichess:53pa9"
  },
  {
    "id": "sacrifice_x5ctm",
    "fen": "6k1/1p6/p3N1p1/3p3p/1P5r/P1P3qP/5pP1/3Q1R1K b - - 1 39",
    "solution": [
      "h4h3",
      "g2h3",
      "g3h3"
    ],
    "theme": "sacrifice",
    "difficulty": 917,
    "source": "lichess:x5CTm"
  },
  {
    "id": "sacrifice_turlb",
    "fen": "r4rk1/ppb3pp/2pqp3/4n3/4N3/1P1P3P/PBP2PP1/R2Q1RK1 b - - 4 16",
    "solution": [
      "e5f3",
      "g2f3",
      "d6h2"
    ],
    "theme": "sacrifice",
    "difficulty": 921,
    "source": "lichess:TurLB"
  },
  {
    "id": "sacrifice_5bdft",
    "fen": "2k5/2p1r3/1rp4p/4qppQ/8/1PPR4/P4PPP/3R2K1 b - - 3 33",
    "solution": [
      "e5e1",
      "d1e1",
      "e7e1"
    ],
    "theme": "sacrifice",
    "difficulty": 958,
    "source": "lichess:5bDft"
  },
  {
    "id": "sacrifice_prc1o",
    "fen": "3n2rk/pp4rp/5q2/4pB2/3p4/8/PPP2PPQ/2K4R w - - 0 28",
    "solution": [
      "h2h7",
      "g7h7",
      "h1h7"
    ],
    "theme": "sacrifice",
    "difficulty": 1005,
    "source": "lichess:prc1o"
  },
  {
    "id": "sacrifice_f31fb",
    "fen": "r4rk1/p3b1B1/2b1Pp2/npp2P2/7R/2P5/P3q1PP/RNQ4K w - - 1 26",
    "solution": [
      "h4h8",
      "g8g7",
      "c1h6"
    ],
    "theme": "sacrifice",
    "difficulty": 1078,
    "source": "lichess:F31FB"
  },
  {
    "id": "sacrifice_m9fiy",
    "fen": "1rb4k/pp1pbBpn/8/4p3/3nP3/P7/1P4r1/1K1R3R w - - 0 23",
    "solution": [
      "h1h7",
      "h8h7",
      "d1h1",
      "g2h2",
      "h1h2",
      "e7h4",
      "h2h4"
    ],
    "theme": "sacrifice",
    "difficulty": 1120,
    "source": "lichess:m9FIy"
  },
  {
    "id": "hangingPiece_yyrl5",
    "fen": "5rk1/1p2r1p1/2p2p2/p2p4/7R/P1P2B1Q/6PP/4qR1K b - - 2 38",
    "solution": [
      "e1f1"
    ],
    "theme": "hangingPiece",
    "difficulty": 724,
    "source": "lichess:yyrl5"
  },
  {
    "id": "hangingPiece_qlfaa",
    "fen": "1k6/6rp/p2R4/1pq1pp2/1Q6/KP6/P5BP/2R5 b - - 0 31",
    "solution": [
      "c5c1"
    ],
    "theme": "hangingPiece",
    "difficulty": 894,
    "source": "lichess:qLFaa"
  },
  {
    "id": "hangingPiece_aimfj",
    "fen": "6k1/6p1/4p2p/ppnpr3/8/P1Pp2NP/1n1R2K1/5R2 w - - 0 38",
    "solution": [
      "d2b2"
    ],
    "theme": "hangingPiece",
    "difficulty": 897,
    "source": "lichess:aiMFj"
  },
  {
    "id": "hangingPiece_yhjvi",
    "fen": "4rNk1/6p1/p1p5/Pp1p1q2/1P1P1p2/7Q/5PPP/1R4K1 b - - 0 29",
    "solution": [
      "f5b1"
    ],
    "theme": "hangingPiece",
    "difficulty": 922,
    "source": "lichess:yHjvi"
  },
  {
    "id": "hangingPiece_gflnu",
    "fen": "4Qq2/1bp2pkp/1pn2p2/pB1r1N2/8/8/PPP2PPP/4R1K1 b - - 9 24",
    "solution": [
      "d5f5",
      "e8f8",
      "g7f8",
      "b5c6",
      "b7c6"
    ],
    "theme": "hangingPiece",
    "difficulty": 961,
    "source": "lichess:gflNu"
  },
  {
    "id": "hangingPiece_m0nul",
    "fen": "r2q1r2/pbp3p1/1pn1N1k1/5p2/2PP4/P2Q4/1P3PPb/R1B2RK1 w - - 0 16",
    "solution": [
      "g1h2",
      "f8h8",
      "h2g1"
    ],
    "theme": "hangingPiece",
    "difficulty": 1072,
    "source": "lichess:M0NuL"
  },
  {
    "id": "hangingPiece_srarn",
    "fen": "5r1k/2q4r/p1n1p2Q/1p2Pp2/1PPp4/P5R1/5PPP/4R1K1 w - - 1 28",
    "solution": [
      "h6f8"
    ],
    "theme": "hangingPiece",
    "difficulty": 1189,
    "source": "lichess:SRaRn"
  },
  {
    "id": "hangingPiece_4aq8n",
    "fen": "r1q3rk/2p1nBp1/pb1p3p/1p2P3/1P1P1n2/P1NQ4/5PR1/R1B3K1 w - - 2 24",
    "solution": [
      "c1f4",
      "c8f5",
      "d3f5"
    ],
    "theme": "hangingPiece",
    "difficulty": 1297,
    "source": "lichess:4AQ8n"
  },
  {
    "id": "mateIn1_gilzi",
    "fen": "1k1r4/ppp2qrp/8/5p2/3Q4/3P2P1/1P1K1Pb1/3R2NR w - - 0 24",
    "solution": [
      "d4d8"
    ],
    "theme": "mateIn1",
    "difficulty": 657,
    "source": "lichess:gILzI"
  },
  {
    "id": "mateIn1_7doww",
    "fen": "r3r1k1/p4pp1/2pQ1np1/q2Np3/8/PB6/1PP2PPP/R1B1R1K1 b - - 0 18",
    "solution": [
      "a5e1"
    ],
    "theme": "mateIn1",
    "difficulty": 686,
    "source": "lichess:7DoWW"
  },
  {
    "id": "mateIn1_a292t",
    "fen": "2Q5/p7/3p4/8/2P5/6kp/P5p1/6K1 b - - 0 44",
    "solution": [
      "h3h2"
    ],
    "theme": "mateIn1",
    "difficulty": 762,
    "source": "lichess:A292T"
  },
  {
    "id": "mateIn1_d9thr",
    "fen": "5Nk1/p5bp/Qp4p1/7r/3P3q/P3P3/1P3RP1/R5K1 b - - 0 29",
    "solution": [
      "h4h1"
    ],
    "theme": "mateIn1",
    "difficulty": 793,
    "source": "lichess:D9Thr"
  },
  {
    "id": "mateIn1_zjlnj",
    "fen": "2r3k1/1p1R1p2/p1b1p1p1/2p1P1B1/4q3/2P3P1/PP3Q2/5RK1 b - - 0 25",
    "solution": [
      "e4h1"
    ],
    "theme": "mateIn1",
    "difficulty": 915,
    "source": "lichess:zjlnJ"
  },
  {
    "id": "mateIn1_ap7gx",
    "fen": "2rq1rk1/1b2bppp/n3p3/pp1nP1N1/3p4/PP3NPP/1BQ2PB1/2R1R1K1 w - - 0 21",
    "solution": [
      "c2h7"
    ],
    "theme": "mateIn1",
    "difficulty": 1078,
    "source": "lichess:AP7Gx"
  },
  {
    "id": "mateIn1_wilgh",
    "fen": "r2q1rk1/pp1nppbp/2p5/3p2NQ/3P1B2/2N1P3/PPP2PP1/R3K3 w Q - 4 14",
    "solution": [
      "h5h7"
    ],
    "theme": "mateIn1",
    "difficulty": 1162,
    "source": "lichess:wilGH"
  },
  {
    "id": "mateIn1_cjvsm",
    "fen": "r2q1rk1/pp1n1p1p/2nbp1pP/6P1/2pQP1b1/2N2N2/PP3PB1/R1B2RK1 w - - 1 15",
    "solution": [
      "d4g7"
    ],
    "theme": "mateIn1",
    "difficulty": 1165,
    "source": "lichess:CJVsM"
  },
  {
    "id": "mateIn2_syj95",
    "fen": "rb2rnk1/ppq2ppp/2p2p2/2P5/1P1P4/5B1P/PB3PP1/R2QR1K1 b - - 0 16",
    "solution": [
      "c7h2",
      "g1f1",
      "h2h1"
    ],
    "theme": "mateIn2",
    "difficulty": 745,
    "source": "lichess:sYj95"
  },
  {
    "id": "mateIn2_y1td8",
    "fen": "3r2k1/1p5p/2ppq1p1/p4r2/2PR2B1/PPNQ4/6PP/R1B3K1 b - - 1 21",
    "solution": [
      "e6e1",
      "d3f1",
      "f5f1"
    ],
    "theme": "mateIn2",
    "difficulty": 850,
    "source": "lichess:Y1Td8"
  },
  {
    "id": "mateIn2_qn9hc",
    "fen": "3r2k1/5ppp/ppQrpn2/2n1B3/2P5/4P3/P4PPP/2RR2K1 b - - 0 24",
    "solution": [
      "d6d1",
      "c1d1",
      "d8d1"
    ],
    "theme": "mateIn2",
    "difficulty": 864,
    "source": "lichess:qn9hC"
  },
  {
    "id": "mateIn2_5x5wc",
    "fen": "1Q1bk2r/5pp1/2pBbq1p/8/8/1B6/Pr3PPP/R3R1K1 b k - 0 20",
    "solution": [
      "f6f2",
      "g1h1",
      "f2g2"
    ],
    "theme": "mateIn2",
    "difficulty": 936,
    "source": "lichess:5X5Wc"
  },
  {
    "id": "mateIn2_wobix",
    "fen": "5N2/2R3pp/5p2/5k2/4p3/4B1PP/5P1K/3q1q2 w - - 4 43",
    "solution": [
      "c7c5",
      "d1d5",
      "c5d5"
    ],
    "theme": "mateIn2",
    "difficulty": 982,
    "source": "lichess:wOBIx"
  },
  {
    "id": "mateIn2_hcrnq",
    "fen": "6k1/5pp1/4p2p/4P3/5P2/2qBP3/pR2K1bP/8 w - - 0 42",
    "solution": [
      "b2b8",
      "c3c8",
      "b8c8"
    ],
    "theme": "mateIn2",
    "difficulty": 1007,
    "source": "lichess:HCrNq"
  },
  {
    "id": "mateIn2_w7bjz",
    "fen": "nb1r4/1pkB1ppp/4p2q/PP2P3/8/2P5/6PP/3R2BK w - - 1 34",
    "solution": [
      "b5b6",
      "a8b6",
      "a5b6"
    ],
    "theme": "mateIn2",
    "difficulty": 1193,
    "source": "lichess:W7BJZ"
  },
  {
    "id": "mateIn2_6gk1p",
    "fen": "r1r2qk1/p4p1p/1p1pn1pQ/3Np3/4P2P/2P2P2/PP3KP1/1R1R4 w - - 3 27",
    "solution": [
      "d5f6",
      "g8h8",
      "h6h7"
    ],
    "theme": "mateIn2",
    "difficulty": 1271,
    "source": "lichess:6Gk1p"
  },
  {
    "id": "backRankMate_uu1tx",
    "fen": "6k1/5ppp/p1r5/1pp5/8/6P1/PPP2P1P/4R1K1 w - - 0 25",
    "solution": [
      "e1e8"
    ],
    "theme": "backRankMate",
    "difficulty": 637,
    "source": "lichess:uU1TX"
  },
  {
    "id": "backRankMate_uk2z6",
    "fen": "6k1/Qb4pp/4pp2/1p1R4/1n6/P3P3/5PPP/2r1N1K1 b - - 2 36",
    "solution": [
      "c1e1"
    ],
    "theme": "backRankMate",
    "difficulty": 689,
    "source": "lichess:uk2z6"
  },
  {
    "id": "backRankMate_sou9u",
    "fen": "8/8/1R3R2/4k3/2pr4/8/PP4PP/7K b - - 2 42",
    "solution": [
      "d4d1",
      "f6f1",
      "d1f1"
    ],
    "theme": "backRankMate",
    "difficulty": 738,
    "source": "lichess:sOu9u"
  },
  {
    "id": "backRankMate_jmo2g",
    "fen": "r5k1/6pp/5p2/3p4/1RnP4/4P2P/5PPB/6K1 b - - 0 32",
    "solution": [
      "a8a1",
      "b4b1",
      "a1b1"
    ],
    "theme": "backRankMate",
    "difficulty": 795,
    "source": "lichess:JMo2G"
  },
  {
    "id": "backRankMate_9npiu",
    "fen": "5r1k/1b6/p3Q3/3NP3/1bpP4/6P1/1P3qPP/R6K b - - 2 29",
    "solution": [
      "f2f1",
      "a1f1",
      "f8f1"
    ],
    "theme": "backRankMate",
    "difficulty": 880,
    "source": "lichess:9npIU"
  },
  {
    "id": "backRankMate_pehzk",
    "fen": "2k4b/ppp1pB2/2n5/6P1/8/3P2q1/PPP5/R4R1K w - - 0 22",
    "solution": [
      "f7e6",
      "c8b8",
      "f1f8",
      "c6d8",
      "f8d8"
    ],
    "theme": "backRankMate",
    "difficulty": 1015,
    "source": "lichess:PEHZk"
  },
  {
    "id": "backRankMate_b5k3o",
    "fen": "2k4r/ppp1pp1p/6p1/1B2q3/P3b3/8/1P1Q1PPP/3R2K1 w - - 0 18",
    "solution": [
      "d2d7",
      "c8b8",
      "d7d8",
      "h8d8",
      "d1d8"
    ],
    "theme": "backRankMate",
    "difficulty": 1115,
    "source": "lichess:b5K3O"
  },
  {
    "id": "backRankMate_no3bp",
    "fen": "r5k1/1pp3pp/p2p4/3Pp1q1/3PP1b1/6Pn/PPP2Q1P/R4R1K w - - 1 21",
    "solution": [
      "f2f7",
      "g8h8",
      "f7f8",
      "a8f8",
      "f1f8"
    ],
    "theme": "backRankMate",
    "difficulty": 1263,
    "source": "lichess:nO3BP"
  },
  {
    "id": "opening_s8hli",
    "fen": "r2q1rk1/ppp2ppp/3bb3/4n1N1/8/2NQ4/PPP2PPP/R1B2RK1 w - - 5 12",
    "solution": [
      "d3h7"
    ],
    "theme": "opening",
    "difficulty": 612,
    "source": "lichess:s8HlI"
  },
  {
    "id": "opening_xjbsn",
    "fen": "r1b1k1nr/1ppp1ppp/3b4/p7/2BpPq2/1Q1P4/PPP2PPP/RNB2RK1 b kq - 0 9",
    "solution": [
      "f4h2"
    ],
    "theme": "opening",
    "difficulty": 716,
    "source": "lichess:XjbSn"
  },
  {
    "id": "opening_fldgd",
    "fen": "rnb1k2r/pppp1ppp/8/4P3/3pq3/4BN2/PPP3PP/RN1Q1BKR b kq - 0 10",
    "solution": [
      "e4e3"
    ],
    "theme": "opening",
    "difficulty": 720,
    "source": "lichess:FLdGd"
  },
  {
    "id": "opening_tnkbx",
    "fen": "rnbqr1k1/ppppb1pp/5p2/7Q/3P3P/3B4/PPP2PP1/R1B1K1NR b KQ - 2 8",
    "solution": [
      "e7b4",
      "e1d1",
      "e8e1"
    ],
    "theme": "opening",
    "difficulty": 815,
    "source": "lichess:tNkbx"
  },
  {
    "id": "opening_yqpy7",
    "fen": "r1b1kb1r/pp3ppp/1qnpp3/8/1P3Bn1/2P2N1P/P2NPPP1/R2QKB1R b KQkq - 0 9",
    "solution": [
      "b6f2"
    ],
    "theme": "opening",
    "difficulty": 852,
    "source": "lichess:yqPy7"
  },
  {
    "id": "opening_zezgp",
    "fen": "rnb4r/pp3ppk/2qbN3/2p1p3/2PP2QP/8/PP3PP1/R1B2RK1 w - - 2 16",
    "solution": [
      "g4g7"
    ],
    "theme": "opening",
    "difficulty": 1028,
    "source": "lichess:ZezgP"
  },
  {
    "id": "opening_3hb7f",
    "fen": "r2qk2r/pppb1ppp/2B2n2/8/Q2Pp3/2b5/PP1N1PPP/R1B1K2R w KQkq - 1 11",
    "solution": [
      "c6d7",
      "d8d7",
      "a4d7",
      "f6d7",
      "b2c3"
    ],
    "theme": "opening",
    "difficulty": 1058,
    "source": "lichess:3HB7F"
  },
  {
    "id": "opening_2tqga",
    "fen": "r1bqkbnr/ppp1p3/2n4p/3pNp2/3P1p2/4P3/PPP1BPPP/RN1QK2R w KQkq - 0 7",
    "solution": [
      "e2h5"
    ],
    "theme": "opening",
    "difficulty": 1122,
    "source": "lichess:2TQGA"
  },
  {
    "id": "middlegame_dbyra",
    "fen": "3r1rk1/ppb3p1/7R/3q3Q/3P1p2/2P4P/PP3PPN/6K1 w - - 0 26",
    "solution": [
      "h6h8"
    ],
    "theme": "middlegame",
    "difficulty": 776,
    "source": "lichess:DbYRa"
  },
  {
    "id": "middlegame_3oytt",
    "fen": "r1b2k2/pppp1ppp/8/8/4n3/5N2/PPP1BPqP/RN1QK1R1 b Q - 1 12",
    "solution": [
      "g2f2"
    ],
    "theme": "middlegame",
    "difficulty": 915,
    "source": "lichess:3OYtt"
  },
  {
    "id": "middlegame_gyc4v",
    "fen": "7r/p3kp1p/2p1pp2/N7/4B2q/5Pb1/P1P1Q1P1/1R4K1 b - - 4 27",
    "solution": [
      "h4h2",
      "g1f1",
      "h2h1"
    ],
    "theme": "middlegame",
    "difficulty": 942,
    "source": "lichess:gYC4v"
  },
  {
    "id": "middlegame_b5qyt",
    "fen": "r3r1k1/p1p2pbp/1p1p2p1/1P3b2/2PP1P2/PQN2N1n/1B4PP/R5RK b - - 0 20",
    "solution": [
      "h3f2"
    ],
    "theme": "middlegame",
    "difficulty": 945,
    "source": "lichess:B5Qyt"
  },
  {
    "id": "middlegame_gerng",
    "fen": "1rb2rk1/p4pbp/6p1/1pQ2P2/5n2/P1PP3P/1P1N2P1/2KR2NR b - - 0 17",
    "solution": [
      "f4d3",
      "c1c2",
      "d3c5"
    ],
    "theme": "middlegame",
    "difficulty": 974,
    "source": "lichess:GeRnG"
  },
  {
    "id": "middlegame_bau5o",
    "fen": "1r2nQ2/1q3r1k/pn1p2p1/1ppPpP2/8/1PP4P/P1B3P1/R4RK1 w - - 1 30",
    "solution": [
      "f5g6"
    ],
    "theme": "middlegame",
    "difficulty": 1040,
    "source": "lichess:BaU5O"
  },
  {
    "id": "middlegame_nxv1y",
    "fen": "r4rk1/pbp2pp1/1p4qp/4PN2/1n4Q1/3P3P/PP4P1/4RR1K w - - 0 24",
    "solution": [
      "f5e7",
      "g8h7",
      "e7g6"
    ],
    "theme": "middlegame",
    "difficulty": 1047,
    "source": "lichess:nXv1y"
  },
  {
    "id": "middlegame_96alc",
    "fen": "4r1k1/p2R1ppb/2p2p1p/1p2rP2/1P4P1/1QP1q2P/P5B1/5R1K w - - 0 25",
    "solution": [
      "b3f7",
      "g8h8",
      "f7g7"
    ],
    "theme": "middlegame",
    "difficulty": 1177,
    "source": "lichess:96alC"
  },
  {
    "id": "endgame_6udyc",
    "fen": "8/8/1p6/1Pkn1Kp1/6P1/8/8/5B2 b - - 1 51",
    "solution": [
      "d5e3",
      "f5g5",
      "e3f1"
    ],
    "theme": "endgame",
    "difficulty": 829,
    "source": "lichess:6udyc"
  },
  {
    "id": "endgame_vtkc3",
    "fen": "2b3k1/p4p1p/3n2p1/6B1/1P1NP3/P2R3P/5KP1/2r5 b - - 0 33",
    "solution": [
      "d6e4",
      "f2e3",
      "e4g5"
    ],
    "theme": "endgame",
    "difficulty": 889,
    "source": "lichess:vTkC3"
  },
  {
    "id": "endgame_bv9m2",
    "fen": "1r1r2k1/5ppp/3q4/p2B4/P2RP3/4Q1P1/5P1P/6K1 w - - 1 31",
    "solution": [
      "d5f7",
      "g8f7",
      "d4d6"
    ],
    "theme": "endgame",
    "difficulty": 930,
    "source": "lichess:BV9M2"
  },
  {
    "id": "endgame_92ijb",
    "fen": "8/pb2k2p/1p2p1p1/3p4/3P4/2P5/PP2K3/5R2 b - - 2 33",
    "solution": [
      "b7a6",
      "e2f2",
      "a6f1"
    ],
    "theme": "endgame",
    "difficulty": 934,
    "source": "lichess:92ijB"
  },
  {
    "id": "endgame_vkxbo",
    "fen": "8/8/5P2/3k3p/p7/P1p4P/8/2K5 b - - 0 61",
    "solution": [
      "d5e6",
      "f6f7",
      "e6f7"
    ],
    "theme": "endgame",
    "difficulty": 988,
    "source": "lichess:VKxbo"
  },
  {
    "id": "endgame_spd0l",
    "fen": "6k1/5r1p/p4Qp1/2n1P3/P7/6P1/2q2P1P/3R2K1 w - - 0 28",
    "solution": [
      "d1d8",
      "f7f8",
      "f6f8"
    ],
    "theme": "endgame",
    "difficulty": 1050,
    "source": "lichess:SPd0l"
  },
  {
    "id": "endgame_j81zc",
    "fen": "4r1k1/4P2p/p1r3p1/q1p1Q3/2p5/2N4P/P1RK2P1/8 w - - 1 32",
    "solution": [
      "e5d5",
      "g8g7",
      "d5c6"
    ],
    "theme": "endgame",
    "difficulty": 1051,
    "source": "lichess:j81ZC"
  },
  {
    "id": "endgame_vy4kq",
    "fen": "4q3/5kpp/3p1p2/2pP4/8/rP2Q1RP/5PP1/6K1 w - - 2 30",
    "solution": [
      "g3g7",
      "f7g7",
      "e3e8"
    ],
    "theme": "endgame",
    "difficulty": 1241,
    "source": "lichess:VY4Kq"
  }
];
