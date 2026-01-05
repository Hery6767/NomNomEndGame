// App.tsx
import React from 'react';
import { KeyboardAvoidingView, Platform } from 'react-native';

// ⚠️ Đảm bảo đường dẫn import đúng với cấu trúc thư mục (có core hay không)
import AppNavigator from './core/navigations/index';
import { AuthProvider } from './core/auth/AuthContext';

export default function App() {
  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* AuthProvider bọc ở đây là CHUẨN NHẤT */}
      <AuthProvider>
        <AppNavigator />
      </AuthProvider>
    </KeyboardAvoidingView>
  );
}