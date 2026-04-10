/**
 * SpectraAuth Mobile — React Native (Expo)
 * Anomaly Detection: Isolation Forest
 *
 * Run: npx expo start
 */

import { useState, useRef, useCallback } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, Image,
  ScrollView, ActivityIndicator, Animated, Alert,
  StatusBar, Platform, TextInput,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";

// ← CHANGE THIS to your computer's local IP on the same Wi-Fi
const API_BASE = "http://10.11.5.235:5000";

const C = {
  bg: "#060a0f", s1: "#0b1118", s2: "#0f1923",
  ok: "#00ff88", bad: "#ff2d55", accent: "#00c8ff",
  text: "#cde8f5", muted: "#5a7a94",
  border: "rgba(0,200,255,0.12)",
};

/* ── Animated ring ───────────────────────────────────────────────── */
const SpinRing = ({ color = C.accent, size = 60 }) => {
  const rot = useRef(new Animated.Value(0)).current;
  const rot2 = useRef(new Animated.Value(0)).current;
  useState(() => {
    Animated.loop(Animated.timing(rot,  { toValue: 1, duration: 1400, useNativeDriver: true })).start();
    Animated.loop(Animated.timing(rot2, { toValue: 1, duration: 900,  useNativeDriver: true })).start();
  });
  const spin  = rot.interpolate({ inputRange: [0,1], outputRange: ["0deg","360deg"] });
  const spin2 = rot2.interpolate({ inputRange: [0,1], outputRange: ["360deg","0deg"] });
  return (
    <View style={{ width: size, height: size, alignItems:"center", justifyContent:"center" }}>
      <Animated.View style={{ position:"absolute", inset:0, borderRadius:size/2, borderWidth:2, borderColor:"transparent", borderTopColor:color, transform:[{rotate:spin}] }}/>
      <Animated.View style={{ position:"absolute", inset:10, borderRadius:(size-20)/2, borderWidth:2, borderColor:"transparent", borderRightColor:C.ok, transform:[{rotate:spin2}] }}/>
    </View>
  );
};

/* ── Gauge (SVG via View) ─────────────────────────────────────────── */
const MiniGauge = ({ value, color }) => {
  const pct = Math.round(value * 100);
  const w = useRef(new Animated.Value(0)).current;
  useState(() => {
    Animated.timing(w, { toValue: pct, duration: 1000, useNativeDriver: false }).start();
  });
  return (
    <View style={mgs.wrap}>
      <Text style={[mgs.pct, { color }]}>{pct}%</Text>
      <View style={mgs.track}>
        <Animated.View style={[mgs.fill, { width: w.interpolate({ inputRange:[0,100], outputRange:["0%","100%"] }), backgroundColor: color }]} />
      </View>
      <Text style={mgs.label}>confidence</Text>
    </View>
  );
};
const mgs = StyleSheet.create({
  wrap:  { alignItems:"center", gap: 4 },
  pct:   { fontFamily: Platform.OS==="ios"?"Courier New":"monospace", fontSize:32, fontWeight:"700" },
  track: { width:"100%", height:6, backgroundColor:"rgba(255,255,255,0.06)", borderRadius:3, overflow:"hidden" },
  fill:  { height:"100%", borderRadius:3 },
  label: { fontSize:10, color:C.muted, fontFamily:Platform.OS==="ios"?"Courier":"monospace" },
});

/* ── Score Card ──────────────────────────────────────────────────── */
const ScoreCard = ({ label, value, color }) => (
  <View style={sc.card}>
    <Text style={sc.label}>{label}</Text>
    <Text style={[sc.val, color && { color }]}>{value}</Text>
  </View>
);
const sc = StyleSheet.create({
  card:  { flex:1, backgroundColor:C.s2, borderWidth:1, borderColor:C.border, borderRadius:8, padding:10, alignItems:"center", gap:4 },
  label: { fontSize:9, color:C.muted, fontFamily:Platform.OS==="ios"?"Courier":"monospace", letterSpacing:0.5 },
  val:   { fontSize:13, color:C.text, fontFamily:Platform.OS==="ios"?"Courier New":"monospace", fontWeight:"600" },
});

/* ── Main ────────────────────────────────────────────────────────── */
export default function App() {
  const [image,    setImage]    = useState(null);
  const [medicine, setMedicine] = useState("");
  const [batchId,  setBatchId]  = useState("");
  const [loading,  setLoading]  = useState(false);
  const [result,   setResult]   = useState(null);
  const [error,    setError]    = useState(null);
  const [history,  setHistory]  = useState([]);
  const [tab,      setTab]      = useState("scan");

  const fadeAnim = useRef(new Animated.Value(0)).current;

  const showResult = useCallback((data) => {
    setResult(data);
    fadeAnim.setValue(0);
    Animated.timing(fadeAnim, { toValue:1, duration:500, useNativeDriver:true }).start();
  }, [fadeAnim]);

  const pickImage = async (useCamera) => {
    const fn = useCamera ? ImagePicker.requestCameraPermissionsAsync : ImagePicker.requestMediaLibraryPermissionsAsync;
    const perm = await fn();
    if (perm.status !== "granted") { Alert.alert("Permission needed"); return; }
    const picker = useCamera ? ImagePicker.launchCameraAsync : ImagePicker.launchImageLibraryAsync;
    const res = await picker({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.85 });
    if (!res.canceled && res.assets[0]) {
      setImage(res.assets[0]); setResult(null); setError(null);
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };


  
 const analyze = async () => {
  setResult({
    result: "Genuine",
    medicine_name: "Test Medicine",
    confidence: 0.95,
    anomaly_score: "0.01",
    decision_score: "0.99",
    label_code: 1,
    scan_id: "123",
    timestamp: new Date().toISOString(),
  });
};





  const clear = () => { setImage(null); setResult(null); setError(null); setMedicine(""); setBatchId(""); };

  const isGenuine = result?.result === "Genuine";
  const vc = result ? (isGenuine ? C.ok : C.bad) : C.accent;

  /* ── Scan Tab ─────────────────────────────────────────────────── */
  const ScanTab = () => (
    <ScrollView style={s.scroll} contentContainerStyle={s.pad} showsVerticalScrollIndicator={false}>

      {/* Header */}
      <View style={s.header}>
        <View style={s.logoBox}><Text style={s.logoIco}>🔬</Text></View>
        <View>
          <Text style={s.logoTitle}>SPECTRAAUTH</Text>
          <Text style={s.logoSub}>Anomaly Detection · Isolation Forest</Text>
        </View>
      </View>

      {/* Inputs */}
      <View style={s.card}>
        <Text style={s.cardTitle}>TABLET INFO</Text>
        <TextInput style={s.inp} placeholder="Medicine Name" placeholderTextColor={C.muted} value={medicine} onChangeText={setMedicine} />
        <TextInput style={s.inp} placeholder="Batch ID (optional)" placeholderTextColor={C.muted} value={batchId} onChangeText={setBatchId} />
      </View>

      {/* Image */}
      {image ? (
        <View style={s.prevCard}>
          <Image source={{ uri: image.uri }} style={s.prevImg} resizeMode="cover" />
          {loading && <View style={s.scanOverlay}><Text style={s.scanTxt}>◈ SCANNING…</Text></View>}
          <View style={s.prevActions}>
            <TouchableOpacity style={s.prevBtn} onPress={() => pickImage(false)}><Text style={s.prevBtnTxt}>📁 Change</Text></TouchableOpacity>
            <TouchableOpacity style={[s.prevBtn, {borderColor:"rgba(255,45,85,0.3)"}]} onPress={clear}><Text style={[s.prevBtnTxt,{color:C.bad}]}>✕ Clear</Text></TouchableOpacity>
          </View>
        </View>
      ) : (
        <View style={s.card}>
          <Text style={s.cardTitle}>IMAGE SOURCE</Text>
          <View style={s.imgRow}>
            <TouchableOpacity style={s.imgBtn} onPress={() => pickImage(true)}>
              <Text style={s.imgEmoji}>📷</Text>
              <Text style={s.imgLbl}>Camera</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.imgBtn} onPress={() => pickImage(false)}>
              <Text style={s.imgEmoji}>🖼️</Text>
              <Text style={s.imgLbl}>Gallery</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Analyze */}
      <TouchableOpacity style={[s.analyzeBtn, (!image || loading) && {opacity:0.4}]} onPress={analyze} disabled={!image || loading} activeOpacity={0.85}>
        {loading
          ? <><ActivityIndicator color={C.bg} size="small" /><Text style={s.analyzeTxt}>Analysing…</Text></>
          : <Text style={s.analyzeTxt}>⬡  RUN SPECTRAL ANALYSIS</Text>
        }
      </TouchableOpacity>

      {error && <View style={s.errBox}><Text style={s.errTxt}>⚠ {error}</Text></View>}

      {/* Result */}
      {result && !loading && (
        <Animated.View style={[s.resultCard, {opacity:fadeAnim}, {borderColor: isGenuine ? "rgba(0,255,136,0.3)" : "rgba(255,45,85,0.3)"}]}>

          {/* Verdict */}
          <View style={[s.verdictIcon, {backgroundColor: isGenuine ? "rgba(0,255,136,0.12)" : "rgba(255,45,85,0.12)"}]}>
            <Text style={[s.verdictEmoji]}>{isGenuine ? "✓" : "!"}</Text>
          </View>
          <Text style={[s.verdictText, {color: vc}]}>{result.result}</Text>
          <Text style={s.verdictMed}>{result.medicine_name}</Text>
          {result.batch_id ? <Text style={s.verdictBatch}>Batch: {result.batch_id}</Text> : null}
          <Text style={s.verdictId}>Scan #{result.scan_id}</Text>

          {/* Alert */}
          {!isGenuine && (
            <View style={s.alertBox}>
              <Text style={s.alertTxt}>⚠ COUNTERFEIT DETECTED — Do NOT consume this medicine!</Text>
            </View>
          )}

          {/* Gauge */}
          <MiniGauge value={result.confidence} color={vc} />

          {/* Score cards */}
          <View style={s.scoreRow}>
            <ScoreCard label="ANOMALY SCORE" value={result.anomaly_score} />
            <ScoreCard label="DECISION" value={result.decision_score} />
            <ScoreCard label="LABEL" value={result.label_code === 1 ? "+1" : "−1"} color={vc} />
          </View>

          <Text style={s.ts}>{new Date(result.timestamp).toLocaleString()}</Text>
        </Animated.View>
      )}
    </ScrollView>
  );

  /* ── History Tab ──────────────────────────────────────────────── */
  const HistoryTab = () => (
    <ScrollView style={s.scroll} contentContainerStyle={s.pad}>
      <Text style={s.histTitle}>SCAN HISTORY</Text>
      {history.length === 0
        ? <Text style={s.noHist}>No scans yet.</Text>
        : history.map(sc => {
          const ok = sc.result === "Genuine";
          return (
            <View key={sc.scan_id} style={[s.histItem, {borderLeftColor: ok ? C.ok : C.bad}]}>
              <View style={s.histTop}>
                <Text style={[s.histVerdict, {color: ok ? C.ok : C.bad}]}>{ok ? "✓" : "!"} {sc.result}</Text>
                <Text style={s.histConf}>{Math.round(sc.confidence*100)}%</Text>
              </View>
              <Text style={s.histMed}>{sc.medicine_name}</Text>
              {sc.batch_id ? <Text style={s.histBatch}>Batch: {sc.batch_id}</Text> : null}
              <Text style={s.histTime}>{new Date(sc.timestamp).toLocaleString()}</Text>
            </View>
          );
        })
      }
    </ScrollView>
  );

  return (
    <View style={s.container}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      {tab === "scan" ? <ScanTab /> : <HistoryTab />}

      {/* Bottom Nav */}
      <View style={s.nav}>
        {[{id:"scan",ico:"🔬",lbl:"Scan"},{id:"history",ico:"🕐",lbl:"History"}].map(t => (
          <TouchableOpacity key={t.id} style={[s.navItem, tab===t.id && s.navActive]} onPress={() => setTab(t.id)}>
            <Text style={s.navIco}>{t.ico}</Text>
            <Text style={[s.navLbl, tab===t.id && {color:C.accent}]}>{t.lbl}</Text>
            {t.id==="history" && history.length > 0 && (
              <View style={s.navBadge}><Text style={s.navBadgeTxt}>{history.length}</Text></View>
            )}
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}

const mono = Platform.OS === "ios" ? "Courier New" : "monospace";
const s = StyleSheet.create({
  container:  { flex:1, backgroundColor:C.bg },
  scroll:     { flex:1 },
  pad:        { padding:18, paddingBottom:100 },

  header:     { flexDirection:"row", alignItems:"center", gap:12, marginBottom:18 },
  logoBox:    { width:44, height:44, borderRadius:8, backgroundColor:"rgba(0,200,255,0.1)", borderWidth:1, borderColor:C.border, alignItems:"center", justifyContent:"center" },
  logoIco:    { fontSize:22 },
  logoTitle:  { fontSize:18, fontWeight:"800", color:C.accent, fontFamily:mono, letterSpacing:2 },
  logoSub:    { fontSize:10, color:C.muted, fontFamily:mono },

  card:       { backgroundColor:C.s1, borderWidth:1, borderColor:C.border, borderRadius:12, padding:14, marginBottom:12 },
  cardTitle:  { fontSize:10, color:C.accent, fontFamily:mono, letterSpacing:1.5, marginBottom:10 },

  inp:        { backgroundColor:C.s2, borderWidth:1, borderColor:C.border, borderRadius:8, padding:11, color:C.text, fontSize:13, marginBottom:8 },

  prevCard:   { backgroundColor:C.s1, borderWidth:1, borderColor:C.border, borderRadius:12, overflow:"hidden", marginBottom:12 },
  prevImg:    { width:"100%", height:220 },
  scanOverlay:{ position:"absolute", top:0, left:0, right:0, bottom:0, backgroundColor:"rgba(6,10,15,0.4)", alignItems:"center", justifyContent:"center" },
  scanTxt:    { color:C.ok, fontFamily:mono, fontSize:14, letterSpacing:4 },
  prevActions:{ flexDirection:"row", gap:10, padding:10 },
  prevBtn:    { flex:1, borderWidth:1, borderColor:C.border, borderRadius:8, padding:9, alignItems:"center" },
  prevBtnTxt: { fontSize:13, color:C.text },

  imgRow:     { flexDirection:"row", gap:12 },
  imgBtn:     { flex:1, backgroundColor:C.s2, borderWidth:1, borderColor:C.border, borderRadius:10, padding:22, alignItems:"center", gap:8 },
  imgEmoji:   { fontSize:26 },
  imgLbl:     { fontSize:12, color:C.muted, fontFamily:mono },

  analyzeBtn: { backgroundColor:C.accent, borderRadius:10, padding:15, flexDirection:"row", alignItems:"center", justifyContent:"center", gap:10, marginBottom:12, shadowColor:C.accent, shadowOffset:{width:0,height:4}, shadowOpacity:0.4, shadowRadius:10 },
  analyzeTxt: { fontSize:14, fontWeight:"800", color:C.bg, fontFamily:mono, letterSpacing:1 },

  errBox:     { backgroundColor:"rgba(255,45,85,0.08)", borderWidth:1, borderColor:"rgba(255,45,85,0.3)", borderRadius:8, padding:12, marginBottom:12 },
  errTxt:     { color:C.bad, fontSize:13, lineHeight:18 },

  resultCard: { backgroundColor:"rgba(0,200,255,0.03)", borderWidth:1, borderRadius:14, padding:18, alignItems:"center", gap:12, marginBottom:12 },
  verdictIcon:{ width:66, height:66, borderRadius:33, alignItems:"center", justifyContent:"center" },
  verdictEmoji:{ fontSize:28, fontWeight:"800", color:"#fff" },
  verdictText:{ fontSize:28, fontWeight:"800", fontFamily:mono, letterSpacing:2 },
  verdictMed: { fontSize:14, color:C.muted },
  verdictBatch:{ fontSize:11, color:C.muted, fontFamily:mono },
  verdictId:  { fontSize:10, color:C.muted, fontFamily:mono },

  alertBox:   { backgroundColor:"rgba(255,45,85,0.1)", borderWidth:1, borderColor:"rgba(255,45,85,0.3)", borderRadius:8, padding:12, width:"100%" },
  alertTxt:   { color:C.bad, fontSize:12, fontWeight:"600", lineHeight:18, textAlign:"center" },

  scoreRow:   { flexDirection:"row", gap:8, width:"100%" },

  ts:         { fontSize:10, color:C.muted, fontFamily:mono, alignSelf:"flex-end" },

  histTitle:  { fontSize:16, fontWeight:"800", color:C.accent, fontFamily:mono, letterSpacing:2, marginBottom:14 },
  noHist:     { color:C.muted, textAlign:"center", marginTop:40 },
  histItem:   { backgroundColor:C.s1, borderWidth:1, borderColor:C.border, borderLeftWidth:3, borderRadius:10, padding:14, marginBottom:10 },
  histTop:    { flexDirection:"row", justifyContent:"space-between", marginBottom:4 },
  histVerdict:{ fontSize:15, fontWeight:"700", fontFamily:mono },
  histConf:   { fontSize:13, color:C.muted, fontFamily:mono },
  histMed:    { fontSize:14, color:C.text, fontWeight:"600" },
  histBatch:  { fontSize:11, color:C.muted, fontFamily:mono },
  histTime:   { fontSize:10, color:C.muted, fontFamily:mono, marginTop:4 },

  nav:        { position:"absolute", bottom:0, left:0, right:0, flexDirection:"row", backgroundColor:C.s1, borderTopWidth:1, borderTopColor:C.border, paddingBottom: Platform.OS==="ios"?24:6 },
  navItem:    { flex:1, alignItems:"center", paddingTop:10, position:"relative" },
  navActive:  {},
  navIco:     { fontSize:22 },
  navLbl:     { fontSize:10, color:C.muted, marginTop:2, fontFamily:mono },
  navBadge:   { position:"absolute", top:6, right:"22%", backgroundColor:C.accent, width:16, height:16, borderRadius:8, alignItems:"center", justifyContent:"center" },
  navBadgeTxt:{ fontSize:9, color:C.bg, fontWeight:"700" },
});