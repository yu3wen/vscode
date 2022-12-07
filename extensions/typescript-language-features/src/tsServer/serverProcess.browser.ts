/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import type * as Proto from '../protocol';
import { TypeScriptServiceConfiguration } from '../utils/configuration';
import { memoize } from '../utils/memoize';
import { TsServerProcess, TsServerProcessKind } from './server';
import { TypeScriptVersion } from './versionProvider';



declare const Worker: any;
declare type Worker = any;

export class WorkerServerProcess implements TsServerProcess {

	public static fork(
		version: TypeScriptVersion,
		args: readonly string[],
		_kind: TsServerProcessKind,
		_configuration: TypeScriptServiceConfiguration,
	) {
		const tsServerPath = version.tsServerPath;
		const worker = new Worker(tsServerPath);
		return new WorkerServerProcess(worker, [
			...args,

			// Explicitly give TS Server its path so it can
			// load local resources
			'--executingFilePath', tsServerPath,
		]);
	}

	private readonly _onDataHandlers = new Set<(data: Proto.Response) => void>();
	private readonly _onErrorHandlers = new Set<(err: Error) => void>();
	private readonly _onExitHandlers = new Set<(code: number | null, signal: string | null) => void>();

	public constructor(
		private readonly worker: Worker,
		args: readonly string[],
	) {
		worker.addEventListener('message', (msg: any) => {
			if (msg.data.type === 'log') {
				this.output.append(msg.data.body);
				return;
			}

			for (const handler of this._onDataHandlers) {
				handler(msg.data);
			}
		});
		worker.onerror = (err: Error) => {
			for (const handler of this._onErrorHandlers) {
				handler(err);
			}
		};
		worker.postMessage(args);
	}

	@memoize
	private get output(): vscode.OutputChannel {
		return vscode.window.createOutputChannel(vscode.l10n.t("TypeScript Server Log"));
	}

	write(serverRequest: Proto.Request): void {
		this.worker.postMessage(serverRequest);
	}

	onData(handler: (response: Proto.Response) => void): void {
		this._onDataHandlers.add(handler);
	}

	onError(handler: (err: Error) => void): void {
		this._onErrorHandlers.add(handler);
	}

	onExit(handler: (code: number | null, signal: string | null) => void): void {
		this._onExitHandlers.add(handler);
		// Todo: not implemented
	}

	kill(): void {
		this.worker.terminate();
	}
}
