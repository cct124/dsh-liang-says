import first from '../../asset/images/liangwenfeng01.png';
import second from '../../asset/images/liangwenfeng02.png';
import { PORTRAITS } from '../core/portraits.ts';

export const PORTRAIT_ASSETS: Readonly<Record<string, string>> = {
  'liangwenfeng01.png': first,
  'liangwenfeng02.png': second,
};
for (const rule of PORTRAITS) {
  if (!PORTRAIT_ASSETS[rule.image]) throw new Error(`Missing portrait asset: ${rule.image}`);
}
