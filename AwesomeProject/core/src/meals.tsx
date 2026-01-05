// src/meals.tsx
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    View,
    Text,
    StyleSheet,
    StatusBar,
    Dimensions,
    TextInput,
    FlatList,
    Image,
    Pressable,
    Modal,
    ActivityIndicator,
    Platform,
    ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context'; // (hiện file này chưa dùng SafeAreaView trong render, có thể bỏ nếu muốn)
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS } from '../style/colors';
import { useAuth } from '../auth/AuthContext';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import GreenHeaderBG from '../components/greenHeader';

import { API_BASE } from '../api/Config';// API cho Android emulator (localhost của máy dev)

// ===== Layout =====
// width: chiều rộng màn hình hiện tại
// CONTENT_W: “bề rộng nội dung” để UI nhìn gọn trên tablet/màn to (max 420)
const { width } = Dimensions.get('window');
const CONTENT_W = Math.min(width * 0.92, 420);

// Lấy màu từ COLORS
const { BRAND, BRAND2, BRAND_LIGHT, BORDER, BG } = COLORS;

// ===== Types =====
// MealType: các khung bữa ăn trong 1 ngày
type MealType = 'Breakfast' | 'Lunch' | 'Snacks' | 'Dinner';

// ViewMode: 3 chế độ hiển thị lịch
type ViewMode = 'Today' | 'Week' | 'Month';

// DayItem: dữ liệu dùng cho Today/Week (pill ngày ở trên)
type DayItem = { key: string; iso: string; day: string; date: string };

// MonthCell: ô trong lưới tháng (có thể null nếu là ô “trống” trước/sau tháng)
type MonthCell = { iso: string | null; date: number | null; inMonth: boolean };

// Recipe: model recipe lấy từ API (đã normalize về các field dùng trong app)
type Recipe = {
    id: number;
    title: string;
    category: string;
    description?: string;
    imageUrl?: string;
    timeMinutes?: number;
    calories?: number;
};

// DayPlan: 1 ngày gồm 4 list (Breakfast/Lunch/Snacks/Dinner)
type DayPlan = Record<MealType, Recipe[]>;

// MealPlan: map isoDate -> DayPlan
type MealPlan = Record<string, DayPlan>;

// PlannedMeal: dạng “phẳng” để Profile đếm (hoặc chỗ khác dùng)
type PlannedMeal = {
    id: string; // unique local id (iso|mealType|recipeId)
    recipeId: number;
    title: string;
    imageUrl?: string;
    dayISO: string;
    mealType: MealType;
};

const MEAL_TYPES: MealType[] = ['Breakfast', 'Lunch', 'Snacks', 'Dinner'];
const WEEKDAY_LABELS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const;

// EMPTY_DAY: template ngày rỗng
const EMPTY_DAY: DayPlan = { Breakfast: [], Lunch: [], Snacks: [], Dinner: [] };

// ============================================================================
// Date helpers
// ============================================================================

// pad2: format số 1 chữ thành 2 chữ (01, 02,...)
function pad2(n: number) {
    return String(n).padStart(2, '0');
}

// toISODate: Date -> 'YYYY-MM-DD'
function toISODate(d: Date) {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

// startOfDay: clone date và set 00:00:00 để tránh lệch do time
function startOfDay(d: Date) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
}

// formatDayShort: lấy thứ dạng 3 chữ
function formatDayShort(d: Date) {
    const days = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
    return days[d.getDay()];
}

/** Today mode: tạo list ngày dạng “rolling” (ví dụ: -2 đến +4 so với ngày active) */
function buildRollingDays(fromISO: string, range: { before: number; after: number }): DayItem[] {
    const base = startOfDay(new Date(fromISO));
    const out: DayItem[] = [];

    for (let i = -range.before; i <= range.after; i++) {
        const x = new Date(base);
        x.setDate(base.getDate() + i);

        out.push({
            key: toISODate(x),
            iso: toISODate(x),
            day: formatDayShort(x),
            date: String(x.getDate()),
        });
    }
    return out;
}

/** Week mode: tạo tuần Monday → Sunday dựa theo ngày active */
function buildWeekDays(fromISO: string): DayItem[] {
    const base = startOfDay(new Date(fromISO));
    const day = base.getDay(); // 0=Sun

    // Tính offset để về Monday (nếu chủ nhật thì lùi 6 ngày)
    const mondayOffset = day === 0 ? -6 : 1 - day;

    const monday = new Date(base);
    monday.setDate(base.getDate() + mondayOffset);

    const out: DayItem[] = [];
    for (let i = 0; i < 7; i++) {
        const x = new Date(monday);
        x.setDate(monday.getDate() + i);

        out.push({
            key: toISODate(x),
            iso: toISODate(x),
            day: formatDayShort(x),
            date: String(x.getDate()),
        });
    }
    return out;
}

/** Month grid (Sun..Sat): tạo lưới tháng dạng 7 cột, nhiều hàng */
function buildMonthGrid(year: number, monthIndex0: number): MonthCell[][] {
    const first = new Date(year, monthIndex0, 1);
    const last = new Date(year, monthIndex0 + 1, 0);
    const daysInMonth = last.getDate();
    const startCol = first.getDay(); // Sun=0..Sat=6

    const cells: MonthCell[] = [];

    // Các ô trống trước ngày 1 để canh đúng cột weekday
    for (let i = 0; i < startCol; i++) cells.push({ iso: null, date: null, inMonth: false });

    // Các ô trong tháng
    for (let d = 1; d <= daysInMonth; d++) {
        const x = new Date(year, monthIndex0, d);
        cells.push({ iso: toISODate(x), date: d, inMonth: true });
    }

    // Bù cho đủ bội số 7
    while (cells.length % 7 !== 0) cells.push({ iso: null, date: null, inMonth: false });

    // Cắt thành từng tuần
    const weeks: MonthCell[][] = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
    return weeks;
}

// ============================================================================
// Storage keys
// - planMapKey: lưu map iso->DayPlan (Meals dùng để hiển thị nhanh)
// - planListKey: lưu list phẳng PlannedMeal[] (Profile dùng để đếm meal plans)
// ============================================================================
function planMapKey(userId?: number) {
    // user có id thì tách storage riêng theo user
    return userId ? `@nomnom_mealplan_u${userId}` : '@nomnom_mealplan_guest';
}

function planListKey(userId?: number) {
    // key này trùng logic Profile đang đọc (@nomnom_meal_plans:<uid/guest>)
    return `@nomnom_meal_plans:${userId ?? 'guest'}`;
}

// safeDayPlan: đảm bảo object ngày có đủ 4 mealType là array
// Mục tiêu: tránh crash khi data bị thiếu field hoặc sai format
function safeDayPlan(x: any): DayPlan {
    const out: DayPlan = { Breakfast: [], Lunch: [], Snacks: [], Dinner: [] };
    if (!x || typeof x !== 'object') return out;

    for (const mt of MEAL_TYPES) {
        const v = x[mt];
        if (Array.isArray(v)) out[mt] = v.filter(Boolean);
        else out[mt] = [];
    }
    return out;
}

// flattenPlanToList: chuyển MealPlan (map) -> PlannedMeal[] (list phẳng)
// Mục tiêu: Profile chỉ cần đếm số item/meal plans, không cần cấu trúc phức tạp
function flattenPlanToList(p: MealPlan): PlannedMeal[] {
    const out: PlannedMeal[] = [];
    const isos = Object.keys(p || {});

    for (const iso of isos) {
        const dp = safeDayPlan(p[iso]);

        for (const mt of MEAL_TYPES) {
            const items = dp[mt] || [];

            for (const r of items) {
                if (!r || typeof r.id !== 'number') continue;

                out.push({
                    id: `${iso}|${mt}|${r.id}`,
                    recipeId: r.id,
                    title: r.title,
                    imageUrl: r.imageUrl,
                    dayISO: iso,
                    mealType: mt,
                });
            }
        }
    }
    return out;
}

// ============================================================================
// Screen
// ============================================================================
export default function Meals() {
    const navigation = useNavigation<any>();
    const { user } = useAuth();

    // todayISO: ngày hiện tại theo ISO
    const [todayISO, setTodayISO] = useState(() => toISODate(new Date()));

    // viewMode: Today / Week / Month
    const [viewMode, setViewMode] = useState<ViewMode>('Today');

    // activeDayISO: ngày đang chọn để hiển thị meal plan
    const [activeDayISO, setActiveDayISO] = useState<string>(() => todayISO);

    // Month cursor: con trỏ tháng (năm + tháng index 0..11)
    const [monthCursor, setMonthCursor] = useState(() => {
        const now = new Date();
        return { y: now.getFullYear(), m: now.getMonth() };
    });

    // ===== topDays: list pill ngày (chỉ dùng cho Today/Week) =====
    const topDays = useMemo(() => {
        if (viewMode === 'Today') return buildRollingDays(activeDayISO, { before: 2, after: 4 });
        if (viewMode === 'Week') return buildWeekDays(activeDayISO);
        return [];
    }, [viewMode, activeDayISO]);

    // ===== Month title + grid =====
    const monthTitle = useMemo(() => {
        // Hiện đang toLocaleString 'en-US' -> hiển thị tiếng Anh (January 2026...)
        const d = new Date(monthCursor.y, monthCursor.m, 1);
        return d.toLocaleString('en-US', { month: 'long', year: 'numeric' });
    }, [monthCursor]);

    const monthGrid = useMemo(() => buildMonthGrid(monthCursor.y, monthCursor.m), [monthCursor]);

    // Prev/Next month
    const goPrevMonth = useCallback(() => {
        setMonthCursor(prev => {
            const m = prev.m - 1;
            if (m < 0) return { y: prev.y - 1, m: 11 };
            return { y: prev.y, m };
        });
    }, []);

    const goNextMonth = useCallback(() => {
        setMonthCursor(prev => {
            const m = prev.m + 1;
            if (m > 11) return { y: prev.y + 1, m: 0 };
            return { y: prev.y, m };
        });
    }, []);

    // ===== Persisted plan (local) =====
    // plan: map iso -> DayPlan
    const [plan, setPlan] = useState<MealPlan>({});

    // loadPlan: đọc meal plan từ AsyncStorage theo user
    // Đồng thời sync list phẳng để Profile đếm
    const loadPlan = useCallback(async () => {
        try {
            const raw = await AsyncStorage.getItem(planMapKey(user?.id));

            if (!raw) {
                // không có data -> set rỗng + sync list phẳng rỗng
                setPlan({});
                await AsyncStorage.setItem(planListKey(user?.id), JSON.stringify([]));
                return;
            }

            // parse + normalize
            const parsed = JSON.parse(raw);
            const normalized: MealPlan = {};
            for (const iso of Object.keys(parsed || {})) normalized[iso] = safeDayPlan(parsed[iso]);

            setPlan(normalized);

            // sync list phẳng ngay lập tức
            const flat = flattenPlanToList(normalized);
            await AsyncStorage.setItem(planListKey(user?.id), JSON.stringify(flat));
        } catch {
            // lỗi parse/storage -> reset rỗng
            setPlan({});
            await AsyncStorage.setItem(planListKey(user?.id), JSON.stringify([]));
        }
    }, [user?.id]);

    // useFocusEffect: mỗi lần vào screen Meals thì load lại plan
    useFocusEffect(
        useCallback(() => {
            loadPlan();
        }, [loadPlan])
    );

    // Save plan: mỗi khi plan đổi -> debounce 250ms -> ghi AsyncStorage
    // Lưu 2 nơi:
    // - mapKey: để Meals load đúng cấu trúc
    // - listKey: để Profile count
    useEffect(() => {
        const t = setTimeout(() => {
            const mapKey = planMapKey(user?.id);
            const listKey = planListKey(user?.id);
            const flat = flattenPlanToList(plan);

            Promise.all([
                AsyncStorage.setItem(mapKey, JSON.stringify(plan)),
                AsyncStorage.setItem(listKey, JSON.stringify(flat)),
            ]).catch(() => { });
        }, 250);

        return () => clearTimeout(t);
    }, [plan, user?.id]);

    // dayMeals: DayPlan của ngày active (đã safe)
    const dayMeals: DayPlan = useMemo(() => safeDayPlan(plan[activeDayISO]), [plan, activeDayISO]);

    // ===== Recipes from API =====
    const [data, setData] = useState<Recipe[]>([]);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState<string | null>(null);

    // fetchRecipes: gọi API /recipes, normalize key field (RecipeId/Name/Category/...)
    const fetchRecipes = useCallback(async () => {
        setLoading(true);
        setErr(null);

        try {
            const res = await fetch(`${API_BASE}/recipes`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const json = await res.json();

            // normalize: đảm bảo data luôn có id/title/category thống nhất
            const normalized: Recipe[] = (Array.isArray(json) ? json : []).map((x: any, idx: number) => ({
                id: Number(x.RecipeId ?? x.recipeId ?? x.Id ?? x.id ?? idx),
                title: String(x.Name ?? x.name ?? x.Title ?? x.title ?? 'Untitled'),
                category: String(x.Category ?? x.category ?? 'Other'),
                description: String(x.Description ?? x.description ?? ''),
                timeMinutes:
                    typeof x.TimeMinutes === 'number'
                        ? x.TimeMinutes
                        : typeof x.timeMinutes === 'number'
                            ? x.timeMinutes
                            : undefined,
                calories:
                    typeof x.Calories === 'number'
                        ? x.Calories
                        : typeof x.calories === 'number'
                            ? x.calories
                            : undefined,
                imageUrl: x.ImageUrl ?? x.imageUrl ?? x.MainImageUrl ?? x.mainImageUrl ?? undefined,
            }));

            setData(normalized);
        } catch (e: any) {
            setErr(e?.message || 'Fetch failed');
            setData([]);
        } finally {
            setLoading(false);
        }
    }, []);

    // mỗi lần focus screen -> fetchRecipes lại
    useFocusEffect(
        useCallback(() => {
            fetchRecipes();
        }, [fetchRecipes])
    );

    // ===== Realtime day rollover =====
    // Mục tiêu: nếu qua ngày mới, todayISO cập nhật.
    // Và nếu đang đứng đúng “today” cũ thì nhảy sang today mới
    useEffect(() => {
        const t = setInterval(() => {
            const nowISO = toISODate(new Date());
            setTodayISO(nowISO);

            setActiveDayISO(prev => (prev === todayISO ? nowISO : prev));
        }, 60 * 1000);

        return () => clearInterval(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [todayISO]);

    // ===== Modal choose recipe =====
    const [modalVisible, setModalVisible] = useState(false);
    const [activeMealType, setActiveMealType] = useState<MealType | null>(null);

    // query: text search trong modal
    const [query, setQuery] = useState('');

    // debouncedQuery: debounce 200ms để filter mượt hơn
    const [debouncedQuery, setDebouncedQuery] = useState('');
    useEffect(() => {
        const t = setTimeout(() => setDebouncedQuery(query.trim()), 200);
        return () => clearTimeout(t);
    }, [query]);

    // openChooser: mở modal + set bữa đang chọn
    const openChooser = (type: MealType) => {
        setActiveMealType(type);
        setQuery('');
        setModalVisible(true);
    };

    // filtered: list recipe cho modal
    // - Ưu tiên lọc theo category trùng mealType (breakfast/lunch/...)
    // - Nếu category không có (ví dụ Snacks), fallback dùng toàn bộ data
    // - Sau đó lọc theo keyword (title/desc/cat)
    const filtered = useMemo(() => {
        const k = debouncedQuery.toLowerCase();
        const type = (activeMealType || '').toLowerCase();

        const base = data.filter(r => (r.category || '').trim().toLowerCase() === type);
        const source = base.length ? base : data;

        if (!k) return source.slice(0, 30);

        return source
            .filter(r => {
                const title = (r.title || '').toLowerCase();
                const desc = (r.description || '').toLowerCase();
                const cat = (r.category || '').toLowerCase();
                return title.includes(k) || desc.includes(k) || cat.includes(k);
            })
            .slice(0, 30);
    }, [data, debouncedQuery, activeMealType]);

    // ===== Add / Remove =====
    // addMeal: thêm recipe vào dayMeals[mt] của activeDayISO
    // - tránh duplicate (cùng recipeId trong cùng mealType)
    const addMeal = (mt: MealType, item: Recipe) => {
        setPlan(prev => {
            const day = safeDayPlan(prev[activeDayISO]);
            const list = day[mt];

            if (list.some(x => x?.id === item.id)) return prev;

            const nextDay: DayPlan = { ...day, [mt]: [...list, item] };
            return { ...prev, [activeDayISO]: nextDay };
        });
    };

    // removeMeal: xóa 1 recipe khỏi mealType của ngày active
    const removeMeal = (mt: MealType, recipeId: number) => {
        setPlan(prev => {
            const day = safeDayPlan(prev[activeDayISO]);
            const nextList = day[mt].filter(x => x?.id !== recipeId);
            const nextDay: DayPlan = { ...day, [mt]: nextList };
            return { ...prev, [activeDayISO]: nextDay };
        });
    };

    // clearMealType: xóa toàn bộ items trong 1 mealType của ngày active
    const clearMealType = (mt: MealType) => {
        setPlan(prev => {
            const day = safeDayPlan(prev[activeDayISO]);
            const nextDay: DayPlan = { ...day, [mt]: [] };
            return { ...prev, [activeDayISO]: nextDay };
        });
    };

    // ===== Navigation to RecipeDetail =====
    const goRecipeDetail = (recipeId: number) => {
        navigation.navigate('RecipeDetail', { id: recipeId });
    };

    // hasPlanOnDay: dùng cho Month view (chấm dot nếu ngày đó có ít nhất 1 meal)
    const hasPlanOnDay = useCallback(
        (iso: string) => {
            const p = plan[iso];
            if (!p) return false;
            const dp = safeDayPlan(p);
            return MEAL_TYPES.some(mt => (dp[mt] || []).length > 0);
        },
        [plan],
    );

    // ===== UI =====
    return (
        <View style={{ flex: 1, backgroundColor: BG }}>
            {/* barStyle hiện đang dark-content, nhưng header màu đậm.
          Nếu bạn muốn chữ status bar trắng cho hợp header, đổi sang "light-content". */}
            <StatusBar barStyle="dark-content" />

            {/* Header */}
            <View style={styles.headerWrap}>
                <GreenHeaderBG backgroundColor={BRAND}>
                    {/* Title */}
                    <View style={styles.headerRow}>
                        <Text style={styles.bigTitle}>
                            Meal <Text style={{ color: '#b7f57d' }}>Planner</Text>
                        </Text>
                    </View>

                    {/* Segmented control: Today / Week / Month */}
                    <View style={styles.segmentWrap}>
                        {(['Today', 'Week', 'Month'] as ViewMode[]).map(mode => (
                            <Pressable
                                key={mode}
                                onPress={() => setViewMode(mode)}
                                style={[styles.segmentItem, viewMode === mode && styles.segmentItemActive]}
                            >
                                <Text style={[styles.segmentText, viewMode === mode && styles.segmentTextActive]}>
                                    {mode}
                                </Text>
                            </Pressable>
                        ))}
                    </View>
                </GreenHeaderBG>

                {/* Khối ngày/tháng (nằm dưới header xanh) */}
                <View style={{ width: CONTENT_W, alignSelf: 'center', paddingTop: 8, paddingBottom: 14 }}>
                    {/* Days / Month */}
                    {viewMode !== 'Month' ? (
                        // Today/Week: list pill ngang
                        <FlatList
                            data={topDays}
                            keyExtractor={d => d.key}
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={{ marginTop: 10 }}
                            ItemSeparatorComponent={() => <View style={{ width: 8 }} />}
                            renderItem={({ item }) => {
                                const active = activeDayISO === item.iso;
                                const isToday = item.iso === todayISO;

                                return (
                                    <Pressable
                                        onPress={() => setActiveDayISO(item.iso)}
                                        style={[
                                            styles.dayPill,
                                            {
                                                backgroundColor: active ? BRAND : BRAND_LIGHT,
                                                // Nếu là today thì viền nhẹ để nhận biết
                                                borderColor: isToday ? 'rgba(13,77,59,0.35)' : 'transparent',
                                            },
                                        ]}
                                    >
                                        <Text
                                            style={[
                                                styles.dayText,
                                                { color: active ? '#fff' : BRAND2, opacity: active ? 1 : 0.9 },
                                            ]}
                                        >
                                            {item.day}
                                        </Text>
                                        <Text
                                            style={[
                                                styles.dayDate,
                                                { color: active ? '#fff' : BRAND2, opacity: active ? 1 : 0.9 },
                                            ]}
                                        >
                                            {item.date}
                                        </Text>
                                    </Pressable>
                                );
                            }}
                        />
                    ) : (
                        // Month: header tháng + grid
                        <View style={{ marginTop: 10 }}>
                            {/* Month header */}
                            <View style={styles.monthHeaderRow}>
                                <Pressable onPress={goPrevMonth} hitSlop={10} style={styles.monthNavBtn}>
                                    <Text style={styles.monthNavText}>{'‹'}</Text>
                                </Pressable>

                                <Text style={styles.monthTitle}>{monthTitle}</Text>

                                <Pressable onPress={goNextMonth} hitSlop={10} style={styles.monthNavBtn}>
                                    <Text style={styles.monthNavText}>{'›'}</Text>
                                </Pressable>
                            </View>

                            {/* Weekday labels */}
                            <View style={styles.weekLabelRow}>
                                {WEEKDAY_LABELS.map(l => (
                                    <Text key={l} style={styles.weekLabel}>
                                        {l}
                                    </Text>
                                ))}
                            </View>

                            {/* Month grid */}
                            <View style={styles.monthGrid}>
                                {monthGrid.map((week, wi) => (
                                    <View
                                        key={`w-${wi}`}
                                        style={[styles.monthWeekRow, wi === monthGrid.length - 1 ? { marginBottom: 0 } : null]}
                                    >
                                        {week.map((cell, ci) => {
                                            const iso = cell.iso;
                                            const active = !!iso && iso === activeDayISO;
                                            const isToday = !!iso && iso === todayISO;
                                            const hasAnyPlan = !!iso && hasPlanOnDay(iso);

                                            return (
                                                <Pressable
                                                    key={`c-${wi}-${ci}`}
                                                    disabled={!iso}
                                                    onPress={() => iso && setActiveDayISO(iso)}
                                                    style={[
                                                        styles.monthCell,
                                                        active ? styles.monthCellActive : null,
                                                        isToday && !active ? styles.monthCellToday : null,
                                                    ]}
                                                >
                                                    <Text
                                                        style={[
                                                            styles.monthCellText,
                                                            !cell.inMonth ? { opacity: 0.25 } : null,
                                                            active ? { color: '#fff' } : { color: BRAND2 },
                                                        ]}
                                                    >
                                                        {cell.date ?? ''}
                                                    </Text>

                                                    {/* Dot báo có plan */}
                                                    {!!hasAnyPlan && (
                                                        <View style={[styles.planDot, active ? { backgroundColor: '#fff' } : { backgroundColor: BRAND }]} />
                                                    )}
                                                </Pressable>
                                            );
                                        })}
                                    </View>
                                ))}
                            </View>
                        </View>
                    )}
                </View>
            </View>

            {/* Content */}
            {loading ? (
                // Loading recipes từ API
                <View style={styles.center}>
                    <ActivityIndicator />
                    <Text style={styles.centerText}>Loading recipes...</Text>
                </View>
            ) : err ? (
                // Nếu lỗi API
                <View style={styles.center}>
                    <Text style={styles.centerText}>Error: {err}</Text>
                    <Pressable onPress={fetchRecipes} style={styles.retryBtn}>
                        <Text style={styles.retryText}>Retry</Text>
                    </Pressable>
                </View>
            ) : (
                // Nội dung chính: 4 section (Breakfast/Lunch/Snacks/Dinner)
                <ScrollView
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{ paddingBottom: Platform.OS === 'android' ? 130 : 110 }}
                >
                    <View style={{ width: CONTENT_W, alignSelf: 'center', paddingVertical: 16, gap: 16 }}>
                        {MEAL_TYPES.map(mt => {
                            const list = dayMeals[mt] ?? [];
                            const showHeaderActions = list.length > 0;

                            return (
                                <View key={mt} style={{ gap: 8 }}>
                                    {/* Header từng section */}
                                    <View style={styles.sectionHeaderRow}>
                                        <Text style={styles.sectionTitle}>{mt}</Text>

                                        {/* Nếu có item thì hiện nút add + clear */}
                                        {showHeaderActions ? (
                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                                {/* Add */}
                                                <Pressable
                                                    onPress={() => openChooser(mt)}
                                                    hitSlop={10}
                                                    android_ripple={{ color: 'rgba(13,77,59,0.15)', borderless: true }}
                                                    style={({ pressed }) => [
                                                        styles.iconBtn,
                                                        { backgroundColor: pressed ? BRAND : 'transparent' },
                                                    ]}
                                                >
                                                    {({ pressed }) => (
                                                        <Image
                                                            source={require('../assets/icon/add.png')}
                                                            style={{ width: 16, height: 16, tintColor: pressed ? '#fff' : BRAND }}
                                                        />
                                                    )}
                                                </Pressable>

                                                {/* Clear */}
                                                <Pressable
                                                    onPress={() => clearMealType(mt)}
                                                    hitSlop={10}
                                                    android_ripple={{ color: 'rgba(220,53,69,0.15)', borderless: true }}
                                                    style={({ pressed }) => [
                                                        styles.iconBtn,
                                                        { backgroundColor: pressed ? '#DC3545' : 'transparent' },
                                                    ]}
                                                >
                                                    {({ pressed }) => (
                                                        <Image
                                                            source={require('../assets/icon/trash.png')}
                                                            style={{ width: 16, height: 16, tintColor: pressed ? '#fff' : BRAND }}
                                                        />
                                                    )}
                                                </Pressable>
                                            </View>
                                        ) : null}
                                    </View>

                                    {/* Nếu rỗng thì hiện nút Choose Meal */}
                                    {list.length === 0 ? (
                                        <Pressable style={styles.chooseBtn} onPress={() => openChooser(mt)}>
                                            <Text style={styles.chooseText}>+ Choose Meal</Text>
                                        </Pressable>
                                    ) : (
                                        // Nếu có item -> render list meal cards
                                        <View style={{ gap: 10 }}>
                                            {list.slice(0, 20).map(item => {
                                                const timeText = typeof item.timeMinutes === 'number' ? `${item.timeMinutes} mins` : '—';
                                                const calText = typeof item.calories === 'number' ? `${item.calories} Cal` : '—';

                                                return (
                                                    <Pressable
                                                        key={`${mt}-${item.id}`}
                                                        style={({ pressed }) => [styles.mealCard, pressed ? { opacity: 0.98 } : null]}
                                                        onPress={() => goRecipeDetail(item.id)}
                                                    >
                                                        <Image
                                                            source={item.imageUrl ? { uri: item.imageUrl } : require('../assets/icon/image-placeholder.png')}
                                                            style={styles.mealImg}
                                                        />

                                                        <View style={styles.mealRight}>
                                                            <Text numberOfLines={1} style={styles.mealTitle}>
                                                                {item.title}
                                                            </Text>

                                                            {!!item.description && (
                                                                <Text numberOfLines={2} style={styles.desc}>
                                                                    {item.description}
                                                                </Text>
                                                            )}

                                                            <View style={styles.metaRow}>
                                                                <View style={styles.metaItem}>
                                                                    <Image
                                                                        source={require('../assets/icon/clock.png')}
                                                                        style={{ width: 14, height: 14, tintColor: BRAND }}
                                                                    />
                                                                    <Text style={styles.metaText}>{timeText}</Text>
                                                                </View>
                                                                <View style={styles.metaItem}>
                                                                    <Image
                                                                        source={require('../assets/icon/fire.png')}
                                                                        style={{ width: 16, height: 16, tintColor: BRAND }}
                                                                    />
                                                                    <Text style={styles.metaText}>{calText}</Text>
                                                                </View>
                                                            </View>
                                                        </View>

                                                        {/* Remove 1 item */}
                                                        <Pressable
                                                            onPress={() => removeMeal(mt, item.id)}
                                                            hitSlop={10}
                                                            android_ripple={{ color: 'rgba(220,53,69,0.15)', borderless: true }}
                                                            style={({ pressed }) => [
                                                                styles.itemTrashBtn,
                                                                { backgroundColor: pressed ? '#DC3545' : 'transparent' },
                                                            ]}
                                                        >
                                                            {({ pressed }) => (
                                                                <Image
                                                                    source={require('../assets/icon/minus.png')}
                                                                    style={{ width: 10, height: 1, tintColor: pressed ? '#fff' : BRAND }}
                                                                />
                                                            )}
                                                        </Pressable>
                                                    </Pressable>
                                                );
                                            })}
                                        </View>
                                    )}
                                </View>
                            );
                        })}
                    </View>
                </ScrollView>
            )}

            {/* Modal choose recipe */}
            <Modal visible={modalVisible} animationType="slide" transparent onRequestClose={() => setModalVisible(false)}>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalBox}>
                        <View style={styles.modalHeader}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                                <Image source={require('../assets/icon/hatcook.png')} style={{ width: 14, height: 14, tintColor: BRAND }} />
                                <Text style={styles.modalTitle}>Choose a {activeMealType ?? 'meal'}</Text>
                            </View>

                            <Pressable onPress={() => setModalVisible(false)} hitSlop={10}>
                                <Text style={styles.modalCloseX}>✕</Text>
                            </Pressable>
                        </View>

                        {/* Search box */}
                        <View style={styles.searchBox}>
                            <Image source={require('../assets/icon/search.png')} style={{ width: 15, height: 15, tintColor: 'rgba(0,0,0,0.4)' }} />
                            <TextInput
                                value={query}
                                onChangeText={setQuery}
                                placeholder="Search (name, description, category)"
                                placeholderTextColor="rgba(0,0,0,0.40)"
                                style={styles.searchInput}
                                autoCapitalize="none"
                                autoCorrect={false}
                            />
                            {!!query && (
                                <Pressable onPress={() => setQuery('')} hitSlop={10}>
                                    <Text style={styles.clearBtn}>Clear</Text>
                                </Pressable>
                            )}
                        </View>

                        {/* List recipe trong modal */}
                        <FlatList
                            data={filtered}
                            keyExtractor={m => String(m.id)}
                            ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
                            renderItem={({ item }) => {
                                const timeText = typeof item.timeMinutes === 'number' ? `${item.timeMinutes} mins` : '—';
                                const calText = typeof item.calories === 'number' ? `${item.calories} Cal` : '—';

                                return (
                                    <Pressable
                                        onPress={() => {
                                            if (!activeMealType) return;
                                            addMeal(activeMealType, item);
                                            setModalVisible(false);
                                        }}
                                        style={({ pressed }) => [styles.modalItem, pressed ? { transform: [{ scale: 0.99 }] } : null]}
                                    >
                                        <Image
                                            source={item.imageUrl ? { uri: item.imageUrl } : require('../assets/icon/image-placeholder.png')}
                                            style={styles.modalImg}
                                        />
                                        <View style={styles.modalRight}>
                                            <Text numberOfLines={1} style={styles.mealTitle}>
                                                {item.title}
                                            </Text>

                                            {!!item.description && (
                                                <Text numberOfLines={2} style={styles.desc}>
                                                    {item.description}
                                                </Text>
                                            )}

                                            <View style={[styles.metaRow, { marginTop: 8 }]}>
                                                <View style={styles.metaItem}>
                                                    <Image source={require('../assets/icon/clock.png')} style={{ width: 14, height: 14, tintColor: BRAND }} />
                                                    <Text style={styles.metaText}>{timeText}</Text>
                                                </View>
                                                <View style={styles.metaItem}>
                                                    <Image source={require('../assets/icon/fire.png')} style={{ width: 16, height: 16, tintColor: BRAND }} />
                                                    <Text style={styles.metaText}>{calText}</Text>
                                                </View>
                                            </View>
                                        </View>
                                    </Pressable>
                                );
                            }}
                            ListEmptyComponent={
                                <View style={{ paddingVertical: 14 }}>
                                    <Text style={{ color: BRAND2, fontWeight: '800', textAlign: 'center' }}>No recipes found.</Text>
                                </View>
                            }
                        />

                        <Pressable style={styles.closeButton} onPress={() => setModalVisible(false)}>
                            <Text style={styles.closeText}>Close</Text>
                        </Pressable>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

// ===== Styles =====
// styles chủ yếu chia thành: headerWrap, segment, day/week/month UI, section meal cards, modal
const styles = StyleSheet.create({
    headerWrap: {
        backgroundColor: '#fff',
        borderBottomLeftRadius: 24,
        borderBottomRightRadius: 24,
        borderBottomWidth: 1,
        borderBottomColor: BORDER,
    },
    headerRow: {
        paddingHorizontal: 16,
        flexDirection: 'row',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
    },
    bigTitle: { color: '#ffffff', fontSize: 24, fontWeight: '800', marginTop: 4 },

    segmentWrap: {
        flexDirection: 'row',
        backgroundColor: '#ecf5f0',
        borderRadius: 12,
        padding: 4,
        borderWidth: 1,
        borderColor: '#d2e8dc',
        margin: 10,
    },
    segmentItem: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8 },
    segmentItemActive: { backgroundColor: '#fff' },
    segmentText: { fontWeight: '700', color: '#3f5f53' },
    segmentTextActive: { color: BRAND },

    dayPill: {
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderRadius: 12,
        alignItems: 'center',
        width: 64,
        borderWidth: 1,            // luôn có viền để ổn định layout
        borderColor: 'transparent' // bình thường trong suốt, hôm nay sẽ set borderColor riêng
    },
    dayTodayOutline: { borderColor: 'rgba(13,77,59,0.35)' }, // (style này hiện bạn chưa dùng trực tiếp)
    dayText: { fontSize: 12, fontWeight: '700' },
    dayDate: { marginTop: 2, fontSize: 14, fontWeight: '800' },

    // Month UI
    monthHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
    monthTitle: { fontWeight: '900', color: BRAND2, fontSize: 14 },
    monthNavBtn: {
        width: 34,
        height: 34,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: BORDER,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#fff',
    },
    monthNavText: { fontSize: 20, fontWeight: '900', color: BRAND2, marginTop: -2 },
    weekLabelRow: { flexDirection: 'row', marginBottom: 6 },
    weekLabel: { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '800', color: BRAND2, opacity: 0.75 },
    monthGrid: { borderWidth: 1, borderColor: BORDER, borderRadius: 14, padding: 10, backgroundColor: '#fff' },
    monthWeekRow: { flexDirection: 'row', marginBottom: 8 },
    monthCell: {
        flex: 1,
        height: 40,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: 'transparent',
    },
    monthCellActive: { backgroundColor: BRAND },
    monthCellToday: { borderColor: 'rgba(13,77,59,0.35)' },
    monthCellText: { fontWeight: '900', fontSize: 13 },
    planDot: { width: 6, height: 6, borderRadius: 99, marginTop: 4 },

    sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    sectionTitle: { color: '#0b1a18', fontWeight: '800', fontSize: 18 },

    chooseBtn: {
        height: 52,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: BORDER,
        backgroundColor: BRAND_LIGHT,
        alignItems: 'center',
        justifyContent: 'center',
    },
    chooseText: { color: BRAND2, fontWeight: '800', fontSize: 15 },

    iconBtn: {
        width: 34,
        height: 34,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: BORDER,
        backgroundColor: '#fff',
        alignItems: 'center',
        justifyContent: 'center',
    },

    mealCard: {
        flexDirection: 'row',
        borderRadius: 14,
        borderWidth: 1,
        borderColor: BORDER,
        backgroundColor: '#fff',
        overflow: 'hidden',
        alignItems: 'center',
        paddingRight: 12,
    },
    mealImg: { width: 76, height: 76, borderRadius: 12, margin: 10, backgroundColor: '#eee' },
    mealRight: { flex: 1, paddingVertical: 10, justifyContent: 'center' },

    mealTitle: { color: '#0b1a18', fontWeight: '800', fontSize: 16 },
    desc: { marginTop: 4, color: BRAND2, opacity: 0.85, fontWeight: '600' },

    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8 },
    metaItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    metaText: { color: BRAND2, fontSize: 11, fontWeight: '700' },

    itemTrashBtn: {
        width: 34,
        height: 34,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: BORDER,
        backgroundColor: '#fff',
        alignItems: 'center',
        justifyContent: 'center',
        marginLeft: 8,
    },

    // Modal
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'flex-end' },
    modalBox: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 16, maxHeight: '78%', gap: 12 },
    modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    modalTitle: { fontSize: 16, fontWeight: '800', color: BRAND2 },
    modalCloseX: { fontSize: 18, fontWeight: '900', color: BRAND2 },

    searchBox: {
        height: 44,
        borderRadius: 12,
        backgroundColor: '#fff',
        paddingHorizontal: 12,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        borderWidth: 1,
        borderColor: BORDER,
    },
    searchInput: { flex: 1, color: '#0b1a18', fontSize: 14, paddingVertical: Platform.select({ ios: 10, android: 6 }) },
    clearBtn: { color: BRAND, fontWeight: '900' },

    modalItem: {
        flexDirection: 'row',
        borderRadius: 14,
        borderWidth: 1,
        borderColor: BORDER,
        backgroundColor: '#fff',
        overflow: 'hidden',
        paddingRight: 12,
        alignItems: 'center',
    },
    modalImg: { width: 76, height: 76, borderRadius: 12, margin: 10, backgroundColor: '#eee' },
    modalRight: { flex: 1, paddingVertical: 10 },

    closeButton: { marginTop: 6, backgroundColor: BRAND, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
    closeText: { color: '#fff', fontWeight: '800', fontSize: 15 },

    center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16 },
    centerText: { fontWeight: '700', color: BRAND2, textAlign: 'center' },
    retryBtn: { marginTop: 6, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 14, backgroundColor: BRAND },
    retryText: { color: '#fff', fontWeight: '900' },
});
