const ModbusBase = require('yeedriver-modbustcpconv');
const MBase = ModbusBase.ModbusBase;
const JobQueue = require('qz-jobqueue').JobQueue;
const _ = require('lodash');
const P = require('bluebird');



class SingleModeBus extends ModbusBase {
    constructor(maxSegLength, minGapLength) {
        super(8, 1);

        this.jobQueue = new JobQueue({consumer: this.doSendData.bind(this)});
        this.curCallIndex = 0;
        this.call_buffer = [];
        this.BI={};
        this.BQ={};
        this.WI={};
        this.WQ={};


        let callACState = () => {
            this.autoCallHandler = null;
            if (this.curCallIndex < this.call_buffer.length) {
                let sendData = _.clone(this.call_buffer[this.curCallIndex]);
                this.sendCtrl(sendData).then((data) => {
                    for(var i = 0; i <= sendData.reg_len;i++){
                        this[sendData.type][sendData.reg_start+i] = data[i];
                    }

                }).catch((e) => {
                    //console.error(`error in call AC State:${e.message || e}`);
                }).finally(() => {
                    this.curCallIndex++;
                    if (this.curCallIndex >= this.call_buffer.length) {
                        this.curCallIndex = 0;
                        this.emit('RegRead', {devId:'single' , memories: this.autoReadMaps['single']});
                    }
                    this.autoCallHandler = setTimeout(function () {
                        callACState();
                    }, 200);
                })
            }
            else {

                this.autoCallHandler = setTimeout(function () {
                    callACState();
                }, 200);
            }
        }
        this.autoCallHandler = setTimeout(callACState, 100);

    }

    initDriver(options) {
        super.initDriver(options);
        this.mId = _.isUndefined(options.mID)?"1":options.mID;

        if(_.isEmpty(options.sids)){
            this.inOrEx({type: "in", devices: {single:'single'}})
        }

        this.call_buffer = [];

        if(options.BQ){
            this.CfgStringParser(options.BQ,"BQ",0x01);
        }
        if(options.BI){
            this.CfgStringParser(options.BI,"BI",0x02);
        }
        if(options.WQ){
            this.CfgStringParser(options.WQ,"WQ",0x03);
        }
        if(options.WI){
            this.CfgStringParser(options.WI,"WI",0x04);
        }



        this.setupEvent();
    }

    CfgStringParser(cfgString,type,func){
        //分割，并且去掉空的。
        let regs = _.compact(cfgString && cfgString.split(/[,\s]/));

        _.each(regs,(reg)=>{
            let se_def = reg.split(/-/);

            if(se_def.length == 1){
                this.call_buffer.push({
                    type:type,
                    func:func,
                    reg_start:parseInt(se_def[0]),
                    reg_len:1
                })
            }else if(se_def.length == 2){
                this.call_buffer.push({
                    type:type,
                    func:func,
                    reg_start:parseInt(se_def[0]),
                    reg_len:parseInt(se_def[1])-parseInt(se_def[0])+1
                })
            }
        });
    }

    ReadBI(mapItem,devId){
        let retObj = [];

        for(let i = mapItem.start;i<=mapItem.end;i++) {
            retObj.push(this.BI[i]);
        }

        return retObj;
    }

    WriteBQ(mapItem,values,devId){

        let regvalues = [];
        for(let i = mapItem.start;i<=mapItem.end;i++) {
            regvalues.push(values[i]);
        }

        let writeBuf = {
            func:0x0f,
            reg_start:mapItem.start,
            reg_values:regvalues,
            reg_addr:mapItem.start,
            reg_value:values[mapItem.start]


        };
        return this.sendCtrl(writeBuf);

    }

    WriteBP(mapItem,values,devId){

        let regvalues = [];
        for(let i = mapItem.start;i<=mapItem.end;i++) {
            regvalues.push(values[i]);
        }

        let writeBuf = {
            func:0x0f,
            reg_start:mapItem.start,
            reg_values:regvalues,
            reg_addr:mapItem.start,
            reg_value:values[mapItem.start]


        };
        return this.sendCtrl(writeBuf);

    }

    ReadWI(mapItem,devId){

        let retObj = [];

        for(let i = mapItem.start;i<=mapItem.end;i++) {
            retObj.push(this.WI[i]);
        }

        return retObj;

    }

    WriteWQ(mapItem,values,devId){
        let regvalues = [];
        for(let i = mapItem.start;i<=mapItem.end;i++) {
            regvalues.push(values[i]);
        }

        let writeBuf = {
            func:0x10,
            reg_start:mapItem.start,
            reg_values:regvalues,
            reg_addr:mapItem.start,
            reg_value:values[mapItem.start]


        };
        return this.sendCtrl(writeBuf);

    }

    sendCtrl(data){

        return this.jobQueue.push(data).then((result)=>{
            if(result.success){
                return P.resolve(result.result);
            }
            else{
                return P.reject(result.reason)
            }
        });
    }

    doSendData(data){
        if(this.mbClient){
            this.mbClient.setID(this.mId);
            switch(data.func){
                case 0x01:
                    return this.mbClient.readCoils(data.reg_start, data.reg_len).then(function(newData){
                        return P.resolve(newData.data);
                    });
                    break;
                case 0x02:
                    return this.mbClient.readDiscreteInputs(data.reg_start, data.reg_len).then(function(newData){
                        return P.resolve(newData.data);
                    });
                    break;
                case 0x03:
                    return this.mbClient.readHoldingRegisters(data.reg_start, data.reg_len).then(function(newData){
                        return P.resolve(newData.data);
                    });
                    break;
                case 0x04:
                    return this.mbClient.readInputRegisters(data.reg_start, data.reg_len).then(function(newData){
                        return P.resolve(newData.data);
                    });
                    break;
                case 0x05:
                    return this.mbClient.writeCoil(data.reg_addr, data.reg_value).then(function(newData){
                        return P.resolve(newData.data);
                    });
                    break;
                case 0x06:
                    return this.mbClient.writeRegister(data.reg_addr, data.reg_value).then(function(newData){
                        return P.resolve(newData.data);
                    });
                    break;
                case 0x0f:
                    return this.mbClient.writeCoils(data.reg_start, data.reg_values).then(function(newData){
                        return P.resolve(newData.data);
                    });
                    break;
                case 0x10:
                    return this.mbClient.writeRegisters(data.reg_start, data.reg_values).then(function(newData){
                        return P.resolve(newData.data);
                    });
                    break;
            }
        }

    }


}

module.exports = new SingleModeBus();