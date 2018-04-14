const ModbusBase = require('yeedriver-modbustcpconv');
const MBase = ModbusBase.ModbusBase;
const JobQueue = require('qz-jobqueue').JobQueue;
const _ = require('lodash');



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
                        this.emit('RegRead', {devId:'single' , memories: this.autoReadMaps[single]});
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
                    type:type
                    func:func,
                    reg_start:parseInt(se_def[0]),
                    reg_len:1
                })
            }else if(se_def.length == 2){
                this.call_buffer.push({
                    type:type
                    func:func,
                    reg_start:parseInt(se_def[0]),
                    reg_len:parseInt(se_def[1])-parseInt(se_def[0])
                })
            }
        });
    }

    ReadBI(mapItem,devId){
        let retObj = [];

        _.each(mapItem,(item)=>{
            retObj.push(this.BI[item]);
        })

        return retObj;
    }

    WriteBQ(mapItem,values,devId){

        let writeBuf = {
            func:0x0f,
            reg_start:mapItem[0],
            reg_values:values

        };
        return this.sendCtl(writeBuf);

    }

    WriteBP(mapItem,values,devId){
        let writeBuf = {
            func:0x0f,
            reg_start:mapItem[0],
            reg_values:values

        };
        return this.sendCtl(writeBuf);
    }

    ReadWI(mapItem,devId){

        let retObj = [];

        _.each(mapItem,(item)=>{
            retObj.push(this.WI[item]);
        })

        return retObj;
    }

    WriteWQ(mapItem,values,devId){
        let writeBuf = {
            func:0x10,
            reg_start:mapItem[0],
            reg_values:values
        };
        return this.sendCtl(writeBuf);
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
            this.mbClient.setID(data.ac_devId);
            switch(data.func){
                case 0x01:
                    return this.mbClient.readCoils(data.reg_start, data.reg_len).then(function(newData){
                        return newData.data;
                    });
                    break;
                case 0x02:
                    return this.mbClient.readDiscreteInputs(data.reg_start, data.reg_len).then(function(newData){
                        return newData.data;
                    });
                    break;
                case 0x03:
                    return this.mbClient.readHoldingRegisters(data.reg_start, data.reg_len).then(function(newData){
                        return newData.data;
                    });
                    break;
                case 0x04:
                    return this.mbClient.readInputRegisters(data.reg_start, data.reg_len).then(function(newData){
                        return newData.data;
                    });
                    break;
                case 0x05:
                    return this.mbClient.writeCoil(data.reg_addr, data.reg_value).then(function(newData){
                        return newData.data;
                    });
                    break;
                case 0x06:
                    return this.mbClient.writeRegister(data.reg_addr, data.reg_value).then(function(newData){
                        return newData.data;
                    });
                    break;
                case 0x0f:
                    return this.mbClient.writeCoils(data.reg_start, data.reg_values).then(function(newData){
                        return newData.data;
                    });
                    break;
                case 0x10:
                    return this.mbClient.writeRegisters(data.reg_start, data.reg_values).then(function(newData){
                        return newData.data;
                    });
                    break;
            }
        }

    }


}

module.exports = new SingleModeBus();