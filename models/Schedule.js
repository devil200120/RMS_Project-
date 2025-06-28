// models/Schedule.js
const mongoose = require('mongoose');

const scheduleSchema = new mongoose.Schema({
  name:{ type:String, required:true, trim:true, maxlength:100 },
  description:{ type:String, trim:true },
  content:[{
    contentId:{ type:mongoose.Schema.Types.ObjectId, ref:'Content', required:true },
    order:{ type:Number, required:true, min:0 },
    customDuration:Number
  }],
  devices:[{ type:mongoose.Schema.Types.ObjectId, ref:'Device' }],
  startDate:{ type:Date, required:true },
  endDate:{ type:Date, required:true },
  startTime:{ type:String, required:true, match:/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/ },
  endTime:{ type:String, required:true, match:/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/ },
  timezone:{ type:String, default:'UTC' },
  repeat:{ type:String, enum:['none','daily','weekly','monthly'], default:'none' },
  weekDays:[{ type:Number, min:0, max:6 }],
  isActive:{ type:Boolean, default:true },
  priority:{ type:Number, default:1, min:1, max:10 },
  createdBy:{ type:mongoose.Schema.Types.ObjectId, ref:'User', required:true }
},{ timestamps:true, toJSON:{ virtuals:true }, toObject:{ virtuals:true } });

// Virtuals for combined datetime
scheduleSchema.virtual('startDateTime').get(function(){
  const [h,m] = this.startTime.split(':').map(Number);
  const d = new Date(this.startDate); d.setHours(h,m,0,0); return d;
});
scheduleSchema.virtual('endDateTime').get(function(){
  const [h,m] = this.endTime.split(':').map(Number);
  const d = new Date(this.endDate);   d.setHours(h,m,0,0); return d;
});

scheduleSchema.index({ startDate:1, endDate:1, isActive:1 });
module.exports = mongoose.model('Schedule', scheduleSchema);
