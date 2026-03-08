import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

import HomeScreen from './HomeScreen';
import LiveScreen from './LiveScreen';
import FavoritesScreen from './FavoritesScreen';
import NewsScreen from './NewsScreen';
import { useAppTheme } from '../../src/theme/AppThemeContext';
import { APP_THEME_COLORS } from '../../src/theme/colors';

const Tab = createBottomTabNavigator();

export default function BottomTabNavigator() {
  const { isLight } = useAppTheme();
  const palette = isLight ? APP_THEME_COLORS.light : APP_THEME_COLORS.dark;

  const protectFavorites = async (e, navigation) => {
    const token = await AsyncStorage.getItem('userToken');

    if (token) {
      return;
    }

    e.preventDefault();
    navigation.getParent()?.navigate('Login', {
      redirectTo: 'Favoris',
      message: 'Connectez-vous pour acceder aux favoris',
    });
  };

  return (
    <Tab.Navigator
      initialRouteName="Home"
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarStyle: {
          backgroundColor: palette.card,
          borderTopWidth: 1,
          borderTopColor: palette.border,
          height: 66,
          paddingTop: 8,
          paddingBottom: 8,
        },
        tabBarActiveTintColor: palette.primary,
        tabBarInactiveTintColor: palette.muted,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '800',
        },
        sceneStyle: {
          backgroundColor: palette.background,
        },
        tabBarIcon: ({ color, size }) => {
          let iconName = 'ellipse-outline';

          if (route.name === 'Home') iconName = 'grid-outline';
          if (route.name === 'Live') iconName = 'radio-outline';
          if (route.name === 'Favoris') iconName = 'star-outline';
          if (route.name === 'News') iconName = 'newspaper-outline';

          return <Ionicons name={iconName} size={size} color={color} />;
        },
      })}
    >
      <Tab.Screen
        name="Home"
        component={HomeScreen}
        options={{
          title: 'Matchs',
          tabBarTestID: 'tab-home',
        }}
      />
      <Tab.Screen
        name="Live"
        component={LiveScreen}
        options={{
          title: 'Live',
          tabBarTestID: 'tab-live',
        }}
      />
      <Tab.Screen
        name="Favoris"
        component={FavoritesScreen}
        options={{
          title: 'Favoris',
          tabBarTestID: 'tab-favoris',
        }}
        listeners={({ navigation }) => ({
          tabPress: async (e) => {
            await protectFavorites(e, navigation);
          },
        })}
      />
      <Tab.Screen
        name="News"
        component={NewsScreen}
        options={{
          title: 'News',
          tabBarTestID: 'tab-news',
        }}
      />
    </Tab.Navigator>
  );
}
