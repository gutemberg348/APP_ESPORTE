import React from 'react';
import { Image } from 'react-native';
import { club, clubCrest } from '../config/club';
export function Crest({ size = 68, height = club.id === 'esporte' ? size : size * 1.27 }: { size?: number; height?: number }) {
  return <Image source={clubCrest} accessibilityLabel={`Escudo do ${club.name}`} resizeMode="contain" style={{ width: size, height }} />;
}
