// Copyright 2017 The go-ethereum Authors
// This file is part of the go-ethereum library.
//
// The go-ethereum library is free software: you can redistribute it and/or modify
// it under the terms of the GNU Lesser General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// The go-ethereum library is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Lesser General Public License for more details.
//
// You should have received a copy of the GNU Lesser General Public License
// along with the go-ethereum library. If not, see <http://www.gnu.org/licenses/>.

// callTracer is a full blown transaction tracer that extracts and reports all
// the internal calls made by a transaction, along with any useful information.
{
	// callstack is the current recursive call stack of the EVM execution.
	callstack: [{}],
	mainTransfer: [],
	// descended tracks whether we've just descended from an outer transaction into
	// an inner call.
	descended: false,

	// step is invoked for every opcode that the VM executes.
	step: function(log, db) {
		// Capture any errors immediately
		var error = log.getError();
		if (error !== undefined) {
			this.fault(log, db);
			return;
		}
		// We only care about system opcodes, faster if we pre-check once
		var syscall = (log.op.toNumber() & 0xf0) == 0xf0;
		if (syscall) {
			var op = log.op.toString();
		}
		// If a new contract is being created, add to the call stack
		if (syscall && op == 'CREATE') {
			var inOff = log.stack.peek(1).valueOf();
			var inEnd = inOff + log.stack.peek(2).valueOf();

			// Assemble the internal call report and store for completion
			var call = {
				type:    op,
				from:    toHex(log.contract.getAddress()),
				input:   toHex(log.memory.slice(inOff, inEnd)),
				gasIn:   log.getGas(),
				gasCost: log.getCost(),
				value:   '0x' + log.stack.peek(0).toString(16)
			};
			this.callstack.push(call);
			this.descended = true
			if(log.stack.peek(0).valueOf()>0) this.mainTransfer.push(call);
			return;
		}
		// If a new method invocation is being done, add to the call stack
		if (syscall && (op == 'CALL' || op == 'CALLCODE' || op == 'DELEGATECALL' || op == 'STATICCALL')) {
			// Skip any pre-compile invocations, those are just fancy opcodes
			var to = toAddress(log.stack.peek(1).toString(16));
			if (isPrecompiled(to)) {
				return
			}
			var off = (op == 'DELEGATECALL' || op == 'STATICCALL' ? 0 : 1);

			var inOff = log.stack.peek(2 + off).valueOf();
			var inEnd = inOff + log.stack.peek(3 + off).valueOf();

			// Assemble the internal call report and store for completion
			var call = {
				type:    op,
				from:    toHex(log.contract.getAddress()),
				to:      toHex(to),
				input:   toHex(log.memory.slice(inOff, inEnd)),
				gasIn:   log.getGas(),
				gasCost: log.getCost(),
				outOff:  log.stack.peek(4 + off).valueOf(),
				outLen:  log.stack.peek(5 + off).valueOf()
			};
			if (op != 'DELEGATECALL' && op != 'STATICCALL') {
				call.value = '0x' + log.stack.peek(2).toString(16);
			}
			if(log.stack.peek(2).valueOf()>0) this.mainTransfer.push(call);
			return;
		}
		
	},

	// fault is invoked when the actual execution of an opcode fails.
	fault: function(log, db) {
	},

	// result is invoked when all the opcodes have been iterated over and returns
	// the final result of the tracing.
	result: function(ctx, db) {
		var result = {calls:this.mainTransfer}
		return result;
	},

	// finalize recreates a call object using the final desired field oder for json
	// serialization. This is a nicety feature to pass meaningfully ordered results
	// to users who don't interpret it, just display it.
	finalize: function(call) {
	}
}
