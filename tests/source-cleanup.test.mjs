import test from 'node:test';import assert from 'node:assert/strict';
import {maskPageFurniture} from '../site/assets/source-cleanup.js';
const context='3)발생일기준과거14일내에부화장에종란을공급한농장';
const text='210\n3) 발생일 기준 과거 14일내에 부화장에 종란을 공급한 농장';
const record={text:'210',edge:'bottom',source_edge:'start',context:context.slice(0,32)};
test('verified printed page is masked while every body character and reference offset stays fixed',()=>{const clean=maskPageFurniture(text,[record]);assert.equal(clean.length,text.length);assert.equal(clean,'   '+text.slice(3));assert.equal(clean.indexOf('14일'),text.indexOf('14일'));});
test('same numeric value in prose, rates, lists or a different page context is never deleted',()=>{for(const s of ['210 수를 검사한다.','210\n보상금 지급기준','1. 기준\n210\n3) 발생일 기준','210% 비율','210. 조치'])assert.equal(maskPageFurniture(s,[record]),s);assert.equal(maskPageFurniture(text,[]),text);});
test('layout footer is removed only from the matching physical edge, not an interior block',()=>{const block='본문 210수\n210';assert.equal(maskPageFurniture(block,[record],{bottom:true}),'본문 210수\n   ');assert.equal(maskPageFurniture(block,[record],{top:true}),block);assert.equal(maskPageFurniture(block,[record],{top:false,bottom:false}),block);});
test('hyphenated source footer preserves newlines and remaining text',()=>{const s='1. 방역 조치\n- 48 -',record={text:'- 48 -',edge:'bottom',source_edge:'end',context:'1.방역조치'};assert.equal(maskPageFurniture(s,[record]),'1. 방역 조치\n      ');});
