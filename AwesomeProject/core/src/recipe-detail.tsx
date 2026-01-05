// src/recipe-detail.tsx
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    Image, // Dùng Image để hiện hình custom
    Pressable,
    ActivityIndicator,
    Platform,
    Modal,
    Alert,
    TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { WebView } from 'react-native-webview';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE } from '../api/Config';

// ==============================
// 🎨 Theme Colors (hardcode trong file này)
// ==============================
const BRAND = '#0d4d3b';
const BG = '#F6F7F9';
const CARD = '#FFFFFF';
const TEXT = '#101828';
const MUTED = '#667085';
const BORDER = 'rgba(16, 24, 40, 0.12)';
const STAR = '#FFC107';
const HEART = '#FF3B30';

// TOKEN_KEY: key lấy token từ AsyncStorage để gọi API có auth
// Lưu ý: Ở file recipes.tsx bạn dùng 'userToken', còn ở đây dùng '@nomnom_token'.
// Nếu 2 key này không đồng nhất thì dễ xảy ra: file này không đọc được token => like/IsLiked sai.
const TOKEN_KEY = '@nomnom_token';

// ==============================
// Types dữ liệu trả về từ API /recipes/:id
// ==============================
type RecipeImage = { ImageId?: number; ImageUrl: string };
type RecipeIngredient = { IngredientId?: number; Ingredient: string };
type RecipeStep = { StepId?: number; StepNumber: number; Instruction: string };

type RecipeDetail = {
    RecipeId: number;
    Name: string;
    Category: string;
    SubCategory?: string;
    Description?: string | null;
    TimeMinutes?: number | null;
    Calories?: number | null;
    Servings?: number | null;
    AverageRating?: number;
    TotalLikes?: number;
    IsLiked?: number;            // backend trả 0/1
    VideoUrl?: string | null;

    images?: RecipeImage[];
    ingredients?: RecipeIngredient[];
    steps?: RecipeStep[];
};

export default function RecipeDetailScreen() {
    const navigation = useNavigation<any>();
    const route = useRoute<any>();

    // id: lấy từ params (RecipeDetail được gọi từ Recipes/Meals)
    const id = Number(route?.params?.id);

    // data: toàn bộ dữ liệu recipe detail sau khi normalize
    const [data, setData] = useState<RecipeDetail | null>(null);

    // loading/err: trạng thái tải API và lỗi
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState<string | null>(null);

    // videoOpen: mở/đóng modal xem video
    const [videoOpen, setVideoOpen] = useState(false);

    // isLiked/totalLikes: state UI cho like (tách riêng để update nhanh)
    const [isLiked, setIsLiked] = useState(false);
    const [totalLikes, setTotalLikes] = useState(0);

    // ==============================
    // fetchDetail: gọi API lấy chi tiết recipe
    // - Có token thì gắn Authorization
    // - Normalize dữ liệu để UI luôn có field đúng
    // - Set state isLiked/totalLikes theo server
    // ==============================
    const fetchDetail = useCallback(async () => {
        setLoading(true);
        setErr(null);

        try {
            const token = await AsyncStorage.getItem(TOKEN_KEY);
            const headers: any = { 'Content-Type': 'application/json' };
            if (token) headers['Authorization'] = `Bearer ${token}`;

            const res = await fetch(`${API_BASE}/recipes/${id}`, { headers });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const json = await res.json();

            // Normalize để tránh trường hợp API thiếu field / null
            const normalized: RecipeDetail = {
                RecipeId: json.RecipeId,
                Name: json.Name ?? 'Untitled',
                Category: json.Category ?? 'Other',
                SubCategory: json.SubCategory,
                Description: json.Description ?? '',
                TimeMinutes: json.TimeMinutes ?? null,
                Calories: json.Calories ?? null,
                Servings: json.Servings ?? 2,
                AverageRating: json.AverageRating ?? 4.5,
                TotalLikes: json.TotalLikes ?? 0,
                IsLiked: json.IsLiked ?? 0,
                VideoUrl: json.VideoUrl ?? null,
                images: Array.isArray(json.images) ? json.images : [],
                ingredients: Array.isArray(json.ingredients) ? json.ingredients : [],
                steps: Array.isArray(json.steps) ? json.steps : [],
            };

            setData(normalized);

            // Set UI liked/likes từ server
            setIsLiked(normalized.IsLiked === 1);
            setTotalLikes(normalized.TotalLikes || 0);

        } catch (e: any) {
            setErr(e?.message || 'Fetch failed');
            setData(null);
        } finally {
            setLoading(false);
        }
    }, [id]);

    // useEffect: khi màn hình mở hoặc id đổi -> fetch detail
    // Nếu id không hợp lệ -> báo lỗi và dừng loading
    useEffect(() => {
        if (!Number.isFinite(id)) {
            setErr('Missing recipe id');
            setLoading(false);
            return;
        }
        fetchDetail();
    }, [fetchDetail, id]);

    // ==============================
    // toggleLike:
    // - Kiểm tra token: chưa login => alert
    // - Optimistic update: update UI trước (isLiked & totalLikes)
    // - Sau đó gọi API /favorites để sync server
    //
    // Lưu ý:
    // - Nếu request fail, hiện tại bạn chỉ console.error, không rollback lại UI.
    // - totalLikes có thể âm nếu prev=0 mà unlike (hiếm nhưng có thể).
    // ==============================
    const toggleLike = async () => {
        try {
            const token = await AsyncStorage.getItem(TOKEN_KEY);
            if (!token) {
                Alert.alert("Yêu cầu", "Bạn cần đăng nhập để lưu món ăn này!");
                return;
            }

            const previousState = isLiked;

            // Optimistic UI
            setIsLiked(!previousState);
            setTotalLikes(prev => previousState ? prev - 1 : prev + 1);

            // Sync server
            await fetch(`${API_BASE}/favorites`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ recipeId: id })
            });
        } catch (error) {
            console.error('Like error', error);
        }
    };

    // coverUrl: lấy hình đầu tiên trong images[] làm cover
    // useMemo để không tính lại không cần thiết khi data không đổi
    const coverUrl = useMemo(() => {
        const first = data?.images?.[0]?.ImageUrl;
        return first || null;
    }, [data]);

    // timeText/calText: format hiển thị (nếu null/undefined => "—")
    const timeText = typeof data?.TimeMinutes === 'number' ? `${data?.TimeMinutes} min` : '—';
    const calText = typeof data?.Calories === 'number' ? `${data?.Calories} kcal` : '—';

    // hasVideo: kiểm tra có VideoUrl không
    const hasVideo = !!data?.VideoUrl && String(data.VideoUrl).trim().length > 0;

    return (
        <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
            {/* Topbar: back + title + (like ở header bị comment) */}
            <View style={styles.topbar}>
                <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={styles.iconBtn}>
                    <Ionicons name="chevron-back" size={24} color={TEXT} />
                </Pressable>

                <Text numberOfLines={1} style={styles.topTitle}>Recipe Detail</Text>

                {/* spacer để cân đối 2 bên -> title nằm đúng giữa */}
                <View style={{ width: 40, height: 40 }} />
            </View>


            {/* 3 trạng thái: loading / error / no data / data ok */}
            {loading ? (
                <View style={styles.center}><ActivityIndicator size="large" color={BRAND} /></View>
            ) : err ? (
                <View style={styles.center}><Text>Error: {err}</Text></View>
            ) : !data ? (
                <View style={styles.center}><Text>No data</Text></View>
            ) : (
                <>
                    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
                        {/* Cover Image block */}
                        <View style={styles.hero}>
                            {coverUrl ? (
                                <Image source={{ uri: coverUrl }} style={styles.heroImg} />
                            ) : (
                                <View style={styles.heroPlaceholder}>
                                    <Ionicons name="image" size={40} color={MUTED} />
                                    <Text style={styles.heroPlaceholderText}>No image</Text>
                                </View>
                            )}

                            {/* Nếu có video => nút Watch video mở modal */}
                            {hasVideo && (
                                <Pressable onPress={() => setVideoOpen(true)} style={styles.playBtn}>
                                    <Ionicons name="play-circle" size={24} color="#fff" />
                                    <Text style={styles.playText}>Watch video</Text>
                                </Pressable>
                            )}
                        </View>

                        {/* Card thông tin chính */}
                        <View style={styles.card}>
                            {/* Category & Badges */}
                            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                                <View style={styles.badge}>
                                    <Text style={styles.badgeText}>{(data.Category || 'Other').toUpperCase()}</Text>
                                </View>

                                {/* SubCategory chỉ hiện khi có */}
                                {data.SubCategory && (
                                    <View style={[styles.badge, { backgroundColor: '#E8F5E9' }]}>
                                        <Text style={[styles.badgeText, { color: '#2E7D32' }]}>{data.SubCategory}</Text>
                                    </View>
                                )}
                            </View>

                            {/* Title & Heart (nút like chính) */}
                            <View style={styles.rowBetween}>
                                <Text style={styles.h1}>{data.Name}</Text>

                                <TouchableOpacity onPress={toggleLike} hitSlop={10}>
                                    <Image
                                        source={isLiked ? require('../assets/icon/heartfill.png') : require('../assets/icon/heart.png')}
                                        style={{
                                            width: 28,
                                            height: 28,
                                            resizeMode: 'contain',
                                            tintColor: isLiked ? HEART : BRAND
                                        }}
                                    />
                                </TouchableOpacity>
                            </View>

                            {/* Ratings & Likes Count */}
                            <View style={styles.ratingRow}>
                                <View style={styles.ratingItem}>
                                    <Image
                                        source={require('../assets/icon/Star 1.png')}
                                        style={[styles.customIcon, { tintColor: STAR }]}
                                    />
                                    <Text style={styles.ratingText}>{data.AverageRating || 4.5} Rating</Text>
                                </View>

                                <View style={styles.ratingItem}>
                                    <Image
                                        source={require('../assets/icon/heartfill.png')}
                                        style={[styles.customIcon, { tintColor: HEART }]}
                                    />
                                    <Text style={styles.ratingText}>{totalLikes} Likes</Text>
                                </View>
                            </View>

                            {/* Description */}
                            {!!data.Description && <Text style={styles.desc}>{data.Description}</Text>}

                            {/* Meta Info: Time / Calories / Servings (dùng icon custom) */}
                            <View style={styles.metaContainer}>
                                {/* Time */}
                                <View style={styles.metaItem}>
                                    <Image
                                        source={require('../assets/icon/clock.png')}
                                        style={styles.customIcon}
                                    />
                                    <Text style={styles.metaValue}>{timeText}</Text>
                                    <Text style={styles.metaLabel}>Time</Text>
                                </View>

                                {/* Calories */}
                                <View style={[styles.metaItem, styles.metaBorder]}>
                                    <Image
                                        source={require('../assets/icon/Vector.png')}
                                        style={styles.customIcon}
                                    />
                                    <Text style={styles.metaValue}>{calText}</Text>
                                    <Text style={styles.metaLabel}>Calories</Text>
                                </View>

                                {/* Servings */}
                                <View style={styles.metaItem}>
                                    <Image
                                        source={require('../assets/icon/user.png')}
                                        style={styles.customIcon}
                                    />
                                    <Text style={styles.metaValue}>{data.Servings} ppl</Text>
                                    <Text style={styles.metaLabel}>Servings</Text>
                                </View>
                            </View>
                        </View>

                        {/* Ingredients */}
                        <View style={styles.card}>
                            <Text style={styles.sectionTitle}>Ingredients</Text>

                            {(data.ingredients || []).length === 0 ? (
                                <Text style={styles.emptyText}>No ingredients</Text>
                            ) : (
                                data.ingredients!.map((ing, idx) => (
                                    <View
                                        key={ing.IngredientId ?? `ing-${idx}`}
                                        style={styles.bulletRow}
                                    >
                                        <View style={styles.bullet} />
                                        <Text style={styles.bulletText}>{ing.Ingredient}</Text>
                                    </View>
                                ))
                            )}
                        </View>

                        {/* Steps */}
                        <View style={styles.card}>
                            <Text style={styles.sectionTitle}>Instructions</Text>

                            {(data.steps || []).length === 0 ? (
                                <Text style={styles.emptyText}>No steps</Text>
                            ) : (
                                data.steps!
                                    .slice() // copy để sort không mutate gốc
                                    .sort((a, b) => (a.StepNumber ?? 0) - (b.StepNumber ?? 0))
                                    .map((st, idx) => (
                                        <View key={st.StepId ?? `step-${idx}`} style={styles.stepRow}>
                                            <View style={styles.stepNo}>
                                                <Text style={styles.stepNoText}>{st.StepNumber ?? idx + 1}</Text>
                                            </View>
                                            <Text style={styles.stepText}>{st.Instruction}</Text>
                                        </View>
                                    ))
                            )}
                        </View>

                        <View style={{ height: 20 }} />
                    </ScrollView>

                    {/* ==============================
                       Video Modal (WebView)
                       - Mở khi videoOpen = true
                       - WebView load VideoUrl (thường là link YouTube)
                       - Cấu hình originWhitelist + JS + domStorage + fullscreen
                    ============================== */}
                    <Modal
                        visible={videoOpen}
                        animationType="slide"
                        onRequestClose={() => setVideoOpen(false)}
                    >
                        <SafeAreaView style={{ flex: 1, backgroundColor: '#000' }}>
                            {/* Header của modal */}
                            <View style={styles.videoTop}>
                                <Pressable onPress={() => setVideoOpen(false)} hitSlop={10} style={styles.videoClose}>
                                    <Ionicons name="close-circle" size={32} color="#fff" />
                                </Pressable>
                                <Text style={styles.videoTitle} numberOfLines={1}>{data.Name}</Text>
                                <View style={{ width: 38 }} />
                            </View>

                            {/* WebView Video */}
                            <WebView
                                style={{ flex: 1, backgroundColor: '#000' }}
                                source={{ uri: String(data.VideoUrl) }}

                                // ✅ Cấu hình thường dùng để YouTube/embedded chạy ổn
                                originWhitelist={['*']}
                                javaScriptEnabled={true}
                                domStorageEnabled={true}
                                allowsInlineMediaPlayback={true}
                                mediaPlaybackRequiresUserAction={false}
                                allowsFullscreenVideo={true}

                                // Loading indicator
                                startInLoadingState={true}
                                renderLoading={() => (
                                    <View
                                        style={{
                                            position: 'absolute',
                                            top: 0,
                                            left: 0,
                                            right: 0,
                                            bottom: 0,
                                            alignItems: 'center',
                                            justifyContent: 'center'
                                        }}
                                    >
                                        <ActivityIndicator size="large" color={BRAND} />
                                    </View>
                                )}

                                // Bắt lỗi link/video không load được
                                onError={(syntheticEvent) => {
                                    const { nativeEvent } = syntheticEvent;
                                    console.warn('WebView error: ', nativeEvent);
                                    Alert.alert('Lỗi', 'Không thể tải video này.');
                                }}
                            />
                        </SafeAreaView>
                    </Modal>
                </>
            )}
        </SafeAreaView>
    );
}

// shadow: tách style đổ bóng theo platform (iOS dùng shadow*, Android dùng elevation)
const shadow = Platform.select({
    ios: {
        shadowColor: '#000',
        shadowOpacity: 0.08,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 6 }
    },
    android: { elevation: 2 },
    default: {},
});

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: BG },

    // Topbar
    topbar: {
        paddingHorizontal: 16,
        paddingVertical: 10,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between'
    },
    iconBtn: {
        width: 40,
        height: 40,
        borderRadius: 12,
        backgroundColor: CARD,
        borderWidth: 1,
        borderColor: BORDER,
        alignItems: 'center',
        justifyContent: 'center',
        ...shadow
    },
    topTitle: {
        fontSize: 20,
        fontWeight: '900',
        color: TEXT,
        flex: 1,
        textAlign: 'center',
        marginHorizontal: 10
    },

    // Scroll container
    scroll: { padding: 16, paddingTop: 6 },

    // Hero image
    hero: {
        borderRadius: 18,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: BORDER,
        backgroundColor: CARD,
        ...shadow
    },
    heroImg: { width: '100%', height: 220, resizeMode: 'cover' },
    heroPlaceholder: {
        width: '100%',
        height: 220,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        backgroundColor: '#EEE'
    },
    heroPlaceholderText: { fontSize: 12.5, fontWeight: '800', color: MUTED },

    // Watch video button
    playBtn: {
        position: 'absolute',
        left: 12,
        bottom: 12,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: BRAND,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 14
    },
    playText: { color: '#fff', fontWeight: '900' },

    // Card
    card: {
        marginTop: 16,
        backgroundColor: CARD,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: BORDER,
        padding: 16,
        ...shadow
    },

    rowBetween: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        gap: 10,
        marginBottom: 8
    },
    h1: { flex: 1, fontSize: 22, fontWeight: '900', color: TEXT, lineHeight: 28 },

    // Badge category/subcategory
    badge: {
        alignSelf: 'flex-start',
        backgroundColor: 'rgba(13,77,59,0.12)',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 8
    },
    badgeText: { fontSize: 11, fontWeight: '800', color: BRAND },

    // Rating row
    ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 20, marginBottom: 12 },
    ratingItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    ratingText: { fontSize: 13, fontWeight: '700', color: MUTED },

    // Description
    desc: {
        fontSize: 14,
        fontWeight: '500',
        color: MUTED,
        lineHeight: 20,
        marginBottom: 16
    },

    // Meta container (Time/Calories/Servings)
    metaContainer: {
        flexDirection: 'row',
        backgroundColor: '#F9FAFB',
        borderRadius: 12,
        paddingVertical: 12,
        justifyContent: 'space-between',
        paddingHorizontal: 4,
        marginTop: 10
    },
    metaItem: { flex: 1, alignItems: 'center', gap: 6 },
    metaBorder: { borderLeftWidth: 1, borderRightWidth: 1, borderColor: '#E4E7EC' },
    metaValue: { fontSize: 14, fontWeight: '800', color: TEXT },
    metaLabel: { fontSize: 11, fontWeight: '600', color: MUTED },

    // Sections
    sectionTitle: { fontSize: 17, fontWeight: '900', color: TEXT, marginBottom: 12 },
    emptyText: { color: MUTED, fontWeight: '600', fontStyle: 'italic' },

    // Ingredients bullet row
    bulletRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', marginBottom: 10 },
    bullet: { width: 6, height: 6, borderRadius: 4, backgroundColor: BRAND, marginTop: 7 },
    bulletText: { flex: 1, fontSize: 14, fontWeight: '500', color: TEXT, lineHeight: 20 },

    // Steps
    stepRow: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', marginBottom: 16 },
    stepNo: { width: 26, height: 26, borderRadius: 8, backgroundColor: BRAND, alignItems: 'center', justifyContent: 'center', marginTop: 0 },
    stepNoText: { color: '#fff', fontWeight: '800', fontSize: 12 },
    stepText: { flex: 1, fontSize: 14, fontWeight: '500', color: TEXT, lineHeight: 22 },

    // Loading/Error center
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16 },
    centerText: { fontWeight: '600', color: MUTED },
    retryBtn: { marginTop: 8, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10, backgroundColor: BRAND },
    retryText: { color: '#fff', fontWeight: '800' },

    // Video modal header
    videoTop: {
        paddingHorizontal: 16,
        paddingVertical: 12,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        backgroundColor: '#000'
    },
    videoClose: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    videoTitle: { flex: 1, color: '#fff', fontWeight: '800', textAlign: 'center' },

    // Icon custom (Image icon)
    customIcon: {
        width: 18,
        height: 18,
        resizeMode: 'contain',
        tintColor: BRAND
    },
});
