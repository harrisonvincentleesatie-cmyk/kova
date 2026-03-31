import { useRef, useState } from 'react';
import {
  Animated,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';

type Tone = 'Polite' | 'Casual' | 'Firm';
type Stage = 'idle' | 'loading' | 'done';
type Variation = 'softer' | 'direct' | 'shorter';

type SayResult = {
  native: string;
  english: string;
  toneExplain: string;
  variations: {
    softer: string;
    direct: string;
    shorter: string;
  };
};

const ACCENT   = '#5252CC';
const SAY_API  = 'https://kova-backend-p02n.onrender.com/say';

const PLACEHOLDERS = [
  'Tell my landlord the toilet is broken',
  'Ask her to come over tonight',
  'Say I\'ll be late to work',
  'Tell my boss I need more time',
];

// ─── Simulation responses ─────────────────────────────────────────────────────

function getSimResult(input: string, tone: Tone): SayResult {
  const lower = input.toLowerCase();

  if (/landlord|rent|deposit|lease|tenancy|toilet|broken|repair/.test(lower)) {
    return {
      native: tone === 'Firm'
        ? 'Anh/chị ơi, bồn cầu nhà em bị hỏng rồi. Nhờ anh/chị sắp xếp sửa sớm giúp em nhé.'
        : tone === 'Casual'
        ? 'Anh/chị ơi, bồn cầu nhà em có vấn đề rồi, nhờ anh/chị xem giúp nhé!'
        : 'Anh/chị ơi, em muốn báo là bồn cầu nhà em đang bị hỏng. Anh/chị có thể sắp xếp thợ sửa giúp em không ạ?',
      english: 'The toilet in my place is broken — could you arrange to have it fixed?',
      toneExplain: tone === 'Firm'
        ? 'Direct and clear — signals this needs to be actioned, not ignored.'
        : tone === 'Casual'
        ? 'Relaxed but clear — natural for an existing relationship with a landlord.'
        : 'Respectful and indirect — appropriate for a formal tenant-landlord situation.',
      variations: {
        softer: 'Em muốn thưa với anh/chị là bồn cầu có vẻ có vấn đề nhỏ, mong anh/chị tiện thì xem qua giúp ạ.',
        direct: 'Bồn cầu nhà em hỏng rồi. Nhờ anh/chị sửa gấp.',
        shorter: 'Bồn cầu bị hỏng ạ — nhờ anh/chị sửa giúp.',
      },
    };
  }

  if (/boss|manager|work|late|meeting|deadline|office|report/.test(lower)) {
    return {
      native: tone === 'Firm'
        ? 'Anh/chị ơi, hôm nay em sẽ đến muộn. Em sẽ cập nhật ngay khi đến.'
        : tone === 'Casual'
        ? 'Anh/chị ơi, em báo trước là hôm nay em trễ một chút nha. Em xin lỗi!'
        : 'Anh/chị ơi, em xin phép báo là hôm nay em sẽ đến muộn một chút. Em xin lỗi vì sự bất tiện này ạ.',
      english: 'I wanted to let you know I\'ll be a bit late today. Sorry for the inconvenience.',
      toneExplain: tone === 'Firm'
        ? 'Confident and factual — no over-apologising, just clear communication.'
        : tone === 'Casual'
        ? 'Light and approachable — works well if you have an informal relationship with your manager.'
        : 'Professional and considerate — signals awareness without over-explaining.',
      variations: {
        softer: 'Em xin lỗi anh/chị trước, hôm nay có thể em sẽ đến trễ một chút ạ.',
        direct: 'Hôm nay em đến muộn. Em sẽ báo lại khi đến.',
        shorter: 'Hôm nay em trễ một chút ạ.',
      },
    };
  }

  if (/girl|her|date|tonight|come over|hang|meet/.test(lower)) {
    return {
      native: tone === 'Firm'
        ? 'Tối nay ghé chỗ anh đi.'
        : tone === 'Casual'
        ? 'Tối nay em rảnh không? Mình gặp nhau nhé?'
        : 'Tối nay em có rảnh không? Anh muốn mình gặp nhau.',
      english: 'Are you free tonight? I\'d like us to meet up.',
      toneExplain: tone === 'Firm'
        ? 'Confident and direct — shows intent clearly without asking for permission.'
        : tone === 'Casual'
        ? 'Light and easy — feels natural, low pressure, leaves the door open.'
        : 'Warm and direct — shows genuine interest without being intense.',
      variations: {
        softer: 'Tối nay em có kế hoạch gì chưa? Nếu rảnh thì mình gặp nhau nhé?',
        direct: 'Tối nay gặp nhau. Anh đợi.',
        shorter: 'Tối nay gặp nhau không?',
      },
    };
  }

  // General fallback
  return {
    native: tone === 'Firm'
      ? 'Cho mình biết thêm về việc này được không?'
      : tone === 'Casual'
      ? 'Bạn ơi, kể thêm cho mình nghe đi!'
      : 'Bạn có thể cho mình biết thêm một chút về việc này không ạ?',
    english: 'Could you tell me a bit more about this?',
    toneExplain: tone === 'Firm'
      ? 'Neutral and clear — gets to the point without unnecessary softening.'
      : tone === 'Casual'
      ? 'Friendly and warm — feels natural in everyday conversation.'
      : 'Open and polite — invites more without pressure.',
    variations: {
      softer: 'Mình muốn hiểu rõ hơn, bạn có thể giải thích thêm không?',
      direct: 'Nói rõ hơn đi.',
      shorter: 'Kể thêm đi.',
    },
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SayScreen() {
  const [stage,             setStage]             = useState<Stage>('idle');
  const [inputText,         setInputText]         = useState('');
  const [tone,              setTone]              = useState<Tone>('Polite');
  const [result,            setResult]            = useState<SayResult | null>(null);
  const [activeVariation,   setActiveVariation]   = useState<Variation | null>(null);

  const resultsAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim   = useRef(new Animated.Value(1)).current;
  const pulseLoop   = useRef<Animated.CompositeAnimation | null>(null);

  const handleSubmit = async () => {
    if (!inputText.trim() || stage !== 'idle') return;

    setStage('loading');
    setActiveVariation(null);

    pulseLoop.current = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.3, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1,   duration: 800, useNativeDriver: true }),
      ])
    );
    pulseLoop.current.start();

    let data: SayResult;
    try {
      const response = await fetch(SAY_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: inputText, tone }),
      });
      if (!response.ok) throw new Error(`Server error ${response.status}`);
      data = await response.json();
    } catch (err) {
      console.log('API failed, using simulation fallback');
      data = getSimResult(inputText, tone);
    }

    pulseLoop.current?.stop();
    pulseAnim.setValue(1);
    setResult(data);
    setStage('done');
    Animated.timing(resultsAnim, { toValue: 1, duration: 600, useNativeDriver: true }).start();
  };

  const handleReset = () => {
    resultsAnim.setValue(0);
    pulseAnim.setValue(1);
    setResult(null);
    setActiveVariation(null);
    setStage('idle');
  };

  const isDone    = stage === 'done';
  const isLoading = stage === 'loading';

  const TONES: Tone[] = ['Polite', 'Casual', 'Firm'];
  const VARIATIONS: { key: Variation; label: string }[] = [
    { key: 'softer',  label: 'Softer'      },
    { key: 'direct',  label: 'More direct' },
    { key: 'shorter', label: 'Shorter'     },
  ];

  return (
    <LinearGradient
      colors={['#0D0D16', '#080809', '#060607']}
      locations={[0, 0.5, 1]}
      style={s.root}
    >
      <LinearGradient
        colors={['rgba(55,55,110,0.10)', 'transparent']}
        style={s.topLight}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        pointerEvents="none"
      />

      <SafeAreaView style={s.safe}>
        <ScrollView
          contentContainerStyle={s.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >

          {/* ── Header ── */}
          <View style={s.topCopy}>
            <Text style={s.wordmark}>Kova</Text>
            <Text style={s.headline}>What do you{'\n'}want to say?</Text>
            <Text style={s.subheadline}>
              I'll make it sound natural and correct.
            </Text>
          </View>

          {/* ── Input ── */}
          {!isDone && (
            <>
              <View style={s.inputWrapper}>
                <LinearGradient
                  colors={['#20203C', '#141428']}
                  style={StyleSheet.absoluteFillObject}
                  start={{ x: 0.5, y: 0 }}
                  end={{ x: 0.5, y: 1 }}
                />
                <View style={s.inputTopHighlight} />
                {isLoading ? (
                  <Animated.Text style={[s.loadingText, { opacity: pulseAnim }]}>
                    Writing the perfect message…
                  </Animated.Text>
                ) : (
                  <TextInput
                    style={s.textInput}
                    placeholder={PLACEHOLDERS[0]}
                    placeholderTextColor="#2E2E52"
                    value={inputText}
                    onChangeText={setInputText}
                    multiline
                    numberOfLines={4}
                    returnKeyType="done"
                    blurOnSubmit
                  />
                )}
              </View>

              {/* Tone selector */}
              {!isLoading && (
                <View style={s.toneRow}>
                  {TONES.map((t) => (
                    <TouchableOpacity
                      key={t}
                      style={[s.toneChip, tone === t && s.toneChipActive]}
                      onPress={() => setTone(t)}
                      activeOpacity={0.7}
                    >
                      <Text style={[s.toneChipText, tone === t && s.toneChipTextActive]}>
                        {t}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}

              {/* Submit button */}
              {!isLoading && (
                <TouchableOpacity
                  style={[s.submitButton, !inputText.trim() && s.submitButtonDisabled]}
                  onPress={handleSubmit}
                  activeOpacity={0.8}
                >
                  <LinearGradient
                    colors={inputText.trim() ? ['#3A3A9A', '#252568'] : ['#1A1A30', '#141424']}
                    style={StyleSheet.absoluteFillObject}
                    start={{ x: 0.5, y: 0 }}
                    end={{ x: 0.5, y: 1 }}
                  />
                  <Text style={[s.submitText, !inputText.trim() && s.submitTextDisabled]}>
                    Make it natural
                  </Text>
                </TouchableOpacity>
              )}
            </>
          )}

          {/* ── Results ── */}
          {isDone && result && (
            <Animated.View style={[s.results, { opacity: resultsAnim }]}>

              {/* Results header */}
              <View style={s.resultsHeader}>
                <Text style={s.resultsWordmark}>KOVA</Text>
                <TouchableOpacity style={s.statusChip} onPress={handleReset} activeOpacity={0.7}>
                  <View style={s.statusDot} />
                  <Text style={s.statusText}>{tone}</Text>
                  <Text style={s.statusAction}>Change</Text>
                </TouchableOpacity>
              </View>

              {/* A — Vietnamese output */}
              <View style={s.section}>
                <Text style={s.sectionLabel}>Say this</Text>
                <View style={s.replyCardWrapper}>
                  <View style={s.replyCard}>
                    <LinearGradient
                      colors={['#191930', '#101020']}
                      style={StyleSheet.absoluteFillObject}
                      start={{ x: 0.5, y: 0 }}
                      end={{ x: 0.5, y: 1 }}
                    />
                    <Text style={s.vietnameseText}>
                      {activeVariation ? result.variations[activeVariation] : result.native}
                    </Text>
                  </View>
                </View>
              </View>

              {/* B — English meaning */}
              <View style={s.section}>
                <Text style={s.sectionLabel}>What you're saying</Text>
                <Text style={s.leadText}>{result.english}</Text>
              </View>

              {/* C — Tone explanation */}
              <View style={s.section}>
                <Text style={s.sectionLabel}>How this comes across</Text>
                <Text style={s.impactLine}>{result.toneExplain}</Text>
              </View>

              {/* D — Variations */}
              <View style={s.section}>
                <Text style={s.sectionLabel}>Adjust it</Text>
                <View style={s.variationRow}>
                  {VARIATIONS.map(({ key, label }) => (
                    <TouchableOpacity
                      key={key}
                      style={[s.variationChip, activeVariation === key && s.variationChipActive]}
                      onPress={() => setActiveVariation(activeVariation === key ? null : key)}
                      activeOpacity={0.7}
                    >
                      <Text style={[s.variationText, activeVariation === key && s.variationTextActive]}>
                        {label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

            </Animated.View>
          )}

        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  safe: { flex: 1 },

  topLight: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    height: 300,
    zIndex: 0,
  },
  scroll: {
    flexGrow: 1,
    paddingTop: 16,
    paddingBottom: 80,
  },

  // Header
  topCopy: {
    paddingTop: 36,
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  wordmark: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4A4A8A',
    letterSpacing: 2.4,
    textTransform: 'uppercase',
    marginBottom: 22,
  },
  headline: {
    fontSize: 34,
    fontWeight: '800',
    color: '#EEEEFA',
    letterSpacing: -1.2,
    lineHeight: 42,
    marginBottom: 12,
  },
  subheadline: {
    fontSize: 15,
    fontWeight: '400',
    color: '#46466A',
    lineHeight: 23,
  },

  // Input card
  inputWrapper: {
    marginHorizontal: 20,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#32325A',
    overflow: 'hidden',
    minHeight: 140,
    padding: 18,
    justifyContent: 'center',
  },
  inputTopHighlight: {
    position: 'absolute',
    top: 0,
    left: '10%',
    right: '10%',
    height: 1,
    backgroundColor: 'rgba(160,160,255,0.25)',
    zIndex: 2,
  },
  textInput: {
    fontSize: 17,
    fontWeight: '400',
    color: '#DCDCF4',
    lineHeight: 26,
    zIndex: 2,
    textAlignVertical: 'top',
  },
  loadingText: {
    fontSize: 17,
    fontWeight: '500',
    color: '#6060A0',
    letterSpacing: -0.2,
    textAlign: 'center',
  },

  // Tone chips
  toneRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
    marginTop: 16,
  },
  toneChip: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#28284A',
    paddingHorizontal: 18,
    paddingVertical: 9,
    backgroundColor: '#0E0E1C',
  },
  toneChipActive: {
    borderColor: ACCENT,
    backgroundColor: '#1C1C38',
  },
  toneChipText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#404068',
    letterSpacing: 0.2,
  },
  toneChipTextActive: {
    color: '#8080CC',
  },

  // Submit button
  submitButton: {
    marginHorizontal: 20,
    marginTop: 20,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#3A3A70',
    overflow: 'hidden',
    paddingVertical: 16,
    alignItems: 'center',
  },
  submitButtonDisabled: {
    borderColor: '#1E1E34',
  },
  submitText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#9090D8',
    letterSpacing: 0.2,
    zIndex: 1,
  },
  submitTextDisabled: {
    color: '#2E2E4A',
  },

  // Results
  results: {
    paddingHorizontal: 24,
    paddingTop: 16,
  },
  resultsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 12,
    marginBottom: 4,
  },
  resultsWordmark: {
    fontSize: 10,
    fontWeight: '700',
    color: '#2E2E52',
    letterSpacing: 2.8,
  },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  statusDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: ACCENT,
    opacity: 0.5,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '400',
    color: '#606090',
  },
  statusAction: {
    fontSize: 11,
    fontWeight: '500',
    color: '#7070A8',
    letterSpacing: 0.2,
    marginLeft: 2,
  },

  section: {
    paddingTop: 48,
  },
  sectionLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: '#48487A',
    textTransform: 'uppercase',
    letterSpacing: 2.4,
    marginBottom: 14,
  },

  // Vietnamese card
  replyCardWrapper: {
    position: 'relative',
  },
  replyCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#303050',
    overflow: 'hidden',
    padding: 22,
  },
  vietnameseText: {
    fontSize: 20,
    fontWeight: '500',
    color: '#EEEEF8',
    lineHeight: 32,
    letterSpacing: -0.2,
    zIndex: 1,
  },

  // English meaning
  leadText: {
    fontSize: 18,
    fontWeight: '400',
    color: '#9090BC',
    lineHeight: 28,
    letterSpacing: -0.1,
  },

  // Tone explanation
  impactLine: {
    fontSize: 15,
    fontWeight: '400',
    color: '#9898C8',
    lineHeight: 23,
    letterSpacing: 0.2,
  },

  // Variation chips
  variationRow: {
    flexDirection: 'row',
    gap: 10,
    flexWrap: 'wrap',
  },
  variationChip: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#28284A',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#0E0E1C',
  },
  variationChipActive: {
    borderColor: ACCENT,
    backgroundColor: '#1C1C38',
  },
  variationText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#404068',
    letterSpacing: 0.2,
  },
  variationTextActive: {
    color: '#8080CC',
  },
});
