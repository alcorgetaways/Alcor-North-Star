import { describe,it,expect } from 'vitest';
import { activityTargets,type ActivityItem } from './activity-plans';
const item=(date:string,quantity:number):ActivityItem=>({occurrence_key:date,activity_type_id:null,name:'Post',quantity,publish_on:date,owner_id:'owner',backup_id:'backup'});
describe('Approved activity quantities',()=>{
 it('derives daily targets from dated quantities',()=>expect(activityTargets([item('2026-11-02',2),item('2026-11-02',3)],'daily')).toEqual([{date:'2026-11-02',quantity:5}]));
 it('groups Sunday in the same Monday-starting week',()=>expect(activityTargets([item('2026-11-02',2),item('2026-11-08',1)],'weekly')).toEqual([{date:'2026-11-02',quantity:3}]));
 it('sums monthly planned quantities without counting task stages',()=>expect(activityTargets([item('2026-11-01',2),item('2026-11-10',4)],'monthly')).toEqual([{date:'2026-11',quantity:6}]));
});