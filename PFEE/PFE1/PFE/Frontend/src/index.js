import React, { useEffect, useMemo, useRef, useState } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Animated, Easing, Image, StyleSheet, View } from "react-native";

import LoginScreen from "../Screens/LoginScreen";
import RegisterScreen from "../Screens/RegisterScreen";
import BottomTabNavigator from "../Screens/Home/BottomTabNavigator";
import MatchDetailsScreen from "../Screens/Home/MatchDetailsScreen";
import LeagueCompetitionScreen from "../Screens/Home/LeagueCompetitionScreen";
import ProfileScreen from "../Screens/ProfileScreen";
import { AppThemeProvider, useAppTheme } from './theme/AppThemeContext';
import { favoritesService } from '../services/favoritesService';
import { notificationService } from '../services/notificationService';

const Stack = createNativeStackNavigator();

function KicklySplash() {
  const { palette: C } = useAppTheme();
  const styles = useMemo(() => createStyles(C), [C]);
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const logoScale = useRef(new Animated.Value(0.9)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;
  const textY = useRef(new Animated.Value(16)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(logoOpacity, {
        toValue: 1,
        duration: 500,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(logoScale, {
        toValue: 1,
        duration: 650,
        easing: Easing.out(Easing.back(1.3)),
        useNativeDriver: true,
      }),
      Animated.timing(textOpacity, {
        toValue: 1,
        duration: 700,
        delay: 200,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(textY, {
        toValue: 0,
        duration: 700,
        delay: 200,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start();
  }, [logoOpacity, logoScale, textOpacity, textY]);

  return (
    <View style={styles.splashRoot}>
      <View style={styles.splashTop} />
      <View style={styles.splashBottom} />
      <View style={styles.splashGlow} />

      <View style={styles.brandWrap}>
        <Animated.View style={{ opacity: logoOpacity, transform: [{ scale: logoScale }] }}>
          <Image source={require("../img/result_0.jpeg")} style={styles.splashLogo} resizeMode="cover" />
        </Animated.View>
        <Animated.Text
          style={[
            styles.splashTitle,
            {
              opacity: textOpacity,
              transform: [{ translateY: textY }],
            },
          ]}
        >
          KICKLY
        </Animated.Text>
      </View>
    </View>
  );
}

function AppRoot() {
  const [showSplash, setShowSplash] = useState(true);
  const { navigationTheme, palette: C } = useAppTheme();
  const styles = useMemo(() => createStyles(C), [C]);

  useEffect(() => {
    const timer = setTimeout(() => setShowSplash(false), 3000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    let mounted = true;

    const bootstrapUserNotifications = async () => {
      try {
        await favoritesService.syncWithServer();
        await notificationService.bootstrapForAuthenticatedUser();
      } catch (error) {
        if (mounted) {
          console.warn('Bootstrap notifications impossible:', error?.message || error);
        }
      }
    };

    bootstrapUserNotifications();

    return () => {
      mounted = false;
    };
  }, []);

  if (showSplash) {
    return <KicklySplash />;
  }

  return (
    <View style={styles.appRoot}>
      <NavigationContainer theme={navigationTheme}>
        <Stack.Navigator
          initialRouteName="MainTabs"
          screenOptions={{ headerShown: false }}
        >
          <Stack.Screen name="MainTabs" component={BottomTabNavigator} />
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="Register" component={RegisterScreen} />
          <Stack.Screen name="MatchDetails" component={MatchDetailsScreen} />
          <Stack.Screen name="LeagueCompetition" component={LeagueCompetitionScreen} />
          <Stack.Screen name="Profile" component={ProfileScreen} />
        </Stack.Navigator>
      </NavigationContainer>
    </View>
  );
}

export default function App() {
  return (
    <AppThemeProvider>
      <AppRoot />
    </AppThemeProvider>
  );
}

const createStyles = (C) => StyleSheet.create({
  splashRoot: {
    flex: 1,
    backgroundColor: C.bg,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  splashTop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 220,
    backgroundColor: C.panelAlt,
    borderBottomRightRadius: 150,
    borderBottomLeftRadius: 40,
    borderWidth: 1,
    borderColor: C.border,
  },
  splashBottom: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: "76%",
    height: 240,
    backgroundColor: C.accent,
    borderTopLeftRadius: 170,
    borderTopRightRadius: 36,
  },
  splashGlow: {
    position: "absolute",
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: "rgba(200, 255, 54, 0.10)",
  },
  brandWrap: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  splashLogo: {
    width: 120,
    height: 120,
    borderRadius: 60,
    marginBottom: 20,
    borderWidth: 3,
    borderColor: C.panel,
  },
  splashTitle: {
    color: C.text,
    fontSize: 38,
    fontWeight: "900",
    letterSpacing: 1,
  },
  appRoot: {
    flex: 1,
  },
});
