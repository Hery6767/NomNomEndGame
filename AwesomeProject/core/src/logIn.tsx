// src/logIn.tsx

import React, { useState } from 'react';
import {
    View,
    Text,
    TextInput,
    Pressable,
    ImageBackground,
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView, // ✅ Xử lý bàn phím
    Platform,
    ScrollView,
    StyleSheet,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Feather from 'react-native-vector-icons/Feather'; // ✅ Icon đẹp
import { useNavigation } from '@react-navigation/native';
import { useAuth } from '../auth/AuthContext';
import { API_BASE } from '../api/Config';
const BRAND = '#0d4d3b'; // Màu xanh chủ đạo

export default function LogIn() {
    // Lấy navigation để chuyển trang (nếu cần quay lại hoặc qua Register)
    const navigation = useNavigation<any>();

    // Lấy hàm đăng nhập từ Context
    const { signIn, loading } = useAuth();

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');

    // Xử lý sự kiện đăng nhập
    const handleLogin = async () => {
        const e = email.trim();

        if (!e || !password) {
            Alert.alert('Missing info', 'Please enter email and password');
            return;
        }

        try {
            await signIn(e, password);
            // ✅ Thành công: AuthContext tự update user -> Stack tự chuyển vào Home
        } catch (err: any) {
            Alert.alert('Login failed', err?.message || 'Invalid email or password');
        }
    };

    return (
        // 1️⃣ NỀN ẢNH + GRADIENT (Giống trang Register/OnBoard)
        <ImageBackground
            source={require('../image/onBoard.png')}
            style={{ flex: 1 }}
            resizeMode="cover"
        >
            <LinearGradient
                colors={['rgba(0,0,0,0.1)', 'rgba(0,0,0,0.3)', 'rgba(3,75,25,0.65)']}
                style={{ flex: 1 }}
            >
                {/* 2️⃣ TRÁNH BÀN PHÍM CHE FORM */}
                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    style={{ flex: 1 }}
                >
                    <ScrollView
                        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 20 }}
                        showsVerticalScrollIndicator={false}
                    >
                        {/* 3️⃣ NÚT BACK (Góc trái trên) */}
                        <Pressable
                            onPress={() => navigation.goBack()}
                            style={styles.backBtn}
                        >
                            <Feather name="arrow-left" size={28} color="#fff" />
                        </Pressable>

                        {/* 4️⃣ CARD TRẮNG CHỨA FORM */}
                        <View style={styles.card}>

                            {/* Header của Card */}
                            <View style={{ marginBottom: 24 }}>
                                <Text style={styles.title}>Welcome Back</Text>
                                <Text style={styles.subtitle}>
                                    Hello there, sign in to continue!
                                </Text>
                            </View>

                            {/* --- INPUT EMAIL --- */}
                            <Text style={styles.label}>Email Address</Text>
                            <View style={styles.inputContainer}>
                                <Feather name="mail" size={20} color="#888" style={{ marginRight: 10 }} />
                                <TextInput
                                    placeholder="you@example.com"
                                    placeholderTextColor="#999"
                                    value={email}
                                    onChangeText={setEmail}
                                    autoCapitalize="none"
                                    keyboardType="email-address"
                                    style={styles.input}
                                />
                            </View>

                            {/* --- INPUT PASSWORD --- */}
                            <Text style={styles.label}>Password</Text>
                            <View style={styles.inputContainer}>
                                <Feather name="lock" size={20} color="#888" style={{ marginRight: 10 }} />
                                <TextInput
                                    placeholder="••••••••"
                                    placeholderTextColor="#999"
                                    secureTextEntry
                                    value={password}
                                    onChangeText={setPassword}
                                    style={styles.input}
                                />
                            </View>

                            {/* Forgot Password (Link giả) */}
                            <Pressable style={{ alignSelf: 'flex-end', marginBottom: 24, marginTop: 8 }}>
                                <Text style={{ color: BRAND, fontWeight: '600', fontSize: 13 }}>
                                    Forgot Password?
                                </Text>
                            </Pressable>

                            {/* --- NÚT LOGIN --- */}
                            <Pressable
                                onPress={handleLogin}
                                disabled={loading}
                                style={({ pressed }) => [
                                    styles.loginBtn,
                                    pressed && { opacity: 0.8 },
                                    loading && { opacity: 0.7 }
                                ]}
                            >
                                {loading ? (
                                    <ActivityIndicator color="#fff" />
                                ) : (
                                    <Text style={styles.loginText}>Login</Text>
                                )}
                            </Pressable>

                            {/* Footer: Chuyển qua trang Register */}
                            <View style={styles.footer}>
                                <Text style={{ color: '#666' }}>Don't have an account? </Text>
                                <Pressable onPress={() => navigation.navigate('Register')}>
                                    <Text style={{ color: BRAND, fontWeight: '700', textDecorationLine: 'underline' }}>
                                        Sign Up
                                    </Text>
                                </Pressable>
                            </View>

                        </View>
                    </ScrollView>
                </KeyboardAvoidingView>
            </LinearGradient>
        </ImageBackground>
    );
}

// ✅ TÁCH STYLES RA CHO GỌN CODE
const styles = StyleSheet.create({
    backBtn: {
        position: 'absolute',
        top: 40,
        left: 0,
        zIndex: 10,
        padding: 10,
    },
    card: {
        backgroundColor: '#fff',
        borderRadius: 30, // Bo góc mạnh tạo cảm giác hiện đại
        padding: 24,
        marginTop: 60,

        // Đổ bóng cho card nổi lên
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 5, // Bóng trên Android
    },
    title: {
        fontSize: 28,
        fontWeight: '800',
        color: BRAND,
        marginBottom: 6,
    },
    subtitle: {
        color: '#666',
        fontSize: 14,
    },
    label: {
        fontSize: 13,
        fontWeight: '600',
        color: '#333',
        marginBottom: 8,
        marginTop: 12,
    },
    inputContainer: {
        flexDirection: 'row', // Xếp icon và input nằm ngang
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#ddd',
        borderRadius: 14,
        paddingHorizontal: 14,
        backgroundColor: '#fafafa', // Nền input xám nhẹ
        height: 52, // Chiều cao input chuẩn tay bấm
    },
    input: {
        flex: 1,
        color: '#000',
        height: '100%',
        fontWeight: '500',
    },
    loginBtn: {
        backgroundColor: BRAND,
        height: 54,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: BRAND,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 5,
        elevation: 4,
    },
    loginText: {
        color: '#fff',
        fontWeight: '700',
        fontSize: 16,
    },
    footer: {
        flexDirection: 'row',
        justifyContent: 'center',
        marginTop: 20,
    }
});