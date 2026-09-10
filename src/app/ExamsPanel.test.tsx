import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { ActiveExamPort, ActiveExamState, PackagePort, PackageSummary } from './ports';
import { ExamsPanel } from './ExamsPanel';

const enem2023: PackageSummary = {
  id: 'enem-2023', institutionId: 'inep', examId: 'enem', editionId: 'enem-2023',
  label: 'ENEM 2023', year: 2023, byteSize: 1_540_000, questionCount: 177, state: 'downloaded',
};
const enem2022: PackageSummary = {
  id: 'enem-2022', institutionId: 'inep', examId: 'enem', editionId: 'enem-2022',
  label: 'ENEM 2022', year: 2022, byteSize: 980_000, questionCount: 175, state: 'update-available',
};

function ports(packages: PackageSummary[], initial: ActiveExamState = { status: 'active', packageId: 'enem-2023', editionId: 'enem-2023' }) {
  const packagePort: PackagePort = {
    list: vi.fn().mockResolvedValue(packages),
    install: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
  };
  const activeExamPort: ActiveExamPort = {
    initialize: vi.fn().mockResolvedValue(initial),
    select: vi.fn().mockImplementation(async (packageId, editionId) => ({ status: 'active', packageId, editionId })),
  };
  return { packagePort, activeExamPort };
}

describe('ExamsPanel', () => {
  it('lists two editions with metadata, installation state and active state in text', async () => {
    const { packagePort, activeExamPort } = ports([enem2023, enem2022]);
    render(<ExamsPanel packagePort={packagePort} activeExamPort={activeExamPort} online onClose={vi.fn()} onContentChange={vi.fn()} />);

    expect(await screen.findByRole('heading', { name: 'ENEM 2023' })).toBeInTheDocument();
    const activeCard = screen.getByRole('article', { name: 'ENEM 2023' });
    expect(within(activeCard).getByText('Baixada')).toBeInTheDocument();
    expect(within(activeCard).getByText('Ativa')).toBeInTheDocument();
    expect(within(activeCard).getByText('177')).toBeInTheDocument();
    expect(within(activeCard).getByText('1,5 MB')).toBeInTheDocument();

    const updateCard = screen.getByRole('article', { name: 'ENEM 2022' });
    expect(within(updateCard).getByText('Atualização disponível')).toBeInTheDocument();
    expect(within(updateCard).getByRole('button', { name: 'Atualizar ENEM 2022' })).toBeEnabled();
    expect(within(updateCard).getByRole('button', { name: 'Estudar ENEM 2022' })).toBeEnabled();
    expect(screen.getByRole('status', { name: '' })).toHaveTextContent('Prova ativa: ENEM 2023');
  });

  it('does not offer study for an edition that is not downloaded and isolates its failure', async () => {
    let rejectDownload: ((reason: Error) => void) | undefined;
    const available = { ...enem2023, state: 'available' as const };
    const downloaded = { ...enem2022, state: 'downloaded' as const };
    const { packagePort, activeExamPort } = ports([available, downloaded], { status: 'active', packageId: downloaded.id, editionId: downloaded.editionId });
    packagePort.install = vi.fn(() => new Promise<void>((_, reject) => { rejectDownload = reject; }));
    const user = userEvent.setup();
    render(<ExamsPanel packagePort={packagePort} activeExamPort={activeExamPort} online onClose={vi.fn()} onContentChange={vi.fn()} />);

    const availableCard = await screen.findByRole('article', { name: 'ENEM 2023' });
    const downloadedCard = screen.getByRole('article', { name: 'ENEM 2022' });
    expect(within(availableCard).queryByRole('button', { name: /Estudar/ })).not.toBeInTheDocument();
    await user.click(within(availableCard).getByRole('button', { name: 'Baixar ENEM 2023' }));
    expect(availableCard).toHaveAttribute('aria-busy', 'true');
    expect(within(downloadedCard).getByRole('button', { name: 'Remover ENEM 2022 do dispositivo' })).toBeEnabled();

    rejectDownload?.(new Error('rede indisponível'));
    expect(await within(availableCard).findByRole('alert')).toHaveTextContent('Não foi possível baixar ENEM 2023. Tente novamente. rede indisponível');
    expect(within(downloadedCard).queryByRole('alert')).not.toBeInTheDocument();
  });

  it('selects a downloaded edition and requires confirmation before removing it', async () => {
    const { packagePort, activeExamPort } = ports([enem2023, { ...enem2022, state: 'downloaded' }]);
    packagePort.list = vi.fn()
      .mockResolvedValueOnce([enem2023, { ...enem2022, state: 'downloaded' }])
      .mockResolvedValueOnce([enem2023]);
    activeExamPort.initialize = vi.fn()
      .mockResolvedValueOnce({ status: 'active', packageId: 'enem-2023', editionId: 'enem-2023' })
      .mockResolvedValueOnce({ status: 'selection-required' });
    const onContentChange = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<ExamsPanel packagePort={packagePort} activeExamPort={activeExamPort} online onClose={vi.fn()} onContentChange={onContentChange} />);

    await user.click(await screen.findByRole('button', { name: 'Estudar ENEM 2022' }));
    expect(activeExamPort.select).toHaveBeenCalledWith('enem-2022', 'enem-2022');
    expect(await screen.findByRole('heading', { name: 'ENEM 2022' })).toHaveFocus();

    const removeButton = screen.getByRole('button', { name: 'Remover ENEM 2022 do dispositivo' });
    await user.click(removeButton);
    expect(screen.getByRole('alertdialog', { name: /Remover ENEM 2022/ })).toBeInTheDocument();
    const cancel = screen.getByRole('button', { name: 'Cancelar' });
    expect(cancel).toHaveFocus();
    await user.click(cancel);
    expect(screen.getByRole('button', { name: 'Remover ENEM 2022 do dispositivo' })).toHaveFocus();
    expect(packagePort.remove).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Remover ENEM 2022 do dispositivo' }));
    await user.click(screen.getByRole('button', { name: 'Confirmar remoção' }));
    expect(packagePort.remove).toHaveBeenCalledWith('enem-2022');
    expect(await screen.findByText('ENEM 2022 foi removida. Escolha outra prova para continuar.')).toHaveFocus();
  });

  it('keeps the active exam selected when an update fails and allows retrying it', async () => {
    const updateAvailable = { ...enem2023, state: 'update-available' as const };
    const updated = { ...enem2023, state: 'downloaded' as const };
    const { packagePort, activeExamPort } = ports([updateAvailable, { ...enem2022, state: 'downloaded' }]);
    packagePort.list = vi.fn()
      .mockResolvedValueOnce([updateAvailable, { ...enem2022, state: 'downloaded' }])
      .mockResolvedValueOnce([updated, { ...enem2022, state: 'downloaded' }]);
    packagePort.install = vi.fn()
      .mockRejectedValueOnce(new Error('pacote inválido'))
      .mockResolvedValueOnce(undefined);
    const onContentChange = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<ExamsPanel packagePort={packagePort} activeExamPort={activeExamPort} online onClose={vi.fn()} onContentChange={onContentChange} />);

    const update = await screen.findByRole('button', { name: 'Atualizar ENEM 2023' });
    await user.click(update);
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível atualizar ENEM 2023. Tente novamente. pacote inválido');
    expect(screen.getByText('Prova ativa:', { exact: false })).toHaveTextContent('Prova ativa: ENEM 2023');
    expect(update).toBeEnabled();

    await user.click(update);
    expect(await screen.findByText('ENEM 2023 foi atualizada e continua ativa.')).toBeInTheDocument();
    expect(packagePort.install).toHaveBeenCalledTimes(2);
    expect(onContentChange).toHaveBeenCalledOnce();
    expect(within(screen.getByRole('article', { name: 'ENEM 2023' })).getByText('Ativa')).toBeInTheDocument();
  });

  it('preserves the active feed when removing another exam fails and allows retrying it', async () => {
    const downloaded2022 = { ...enem2022, state: 'downloaded' as const };
    const { packagePort, activeExamPort } = ports([enem2023, downloaded2022]);
    packagePort.list = vi.fn()
      .mockResolvedValueOnce([enem2023, downloaded2022])
      .mockResolvedValueOnce([enem2023]);
    packagePort.remove = vi.fn()
      .mockRejectedValueOnce(new Error('armazenamento ocupado'))
      .mockResolvedValueOnce(undefined);
    const onContentChange = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<ExamsPanel packagePort={packagePort} activeExamPort={activeExamPort} online onClose={vi.fn()} onContentChange={onContentChange} />);

    await user.click(await screen.findByRole('button', { name: 'Remover ENEM 2022 do dispositivo' }));
    await user.click(screen.getByRole('button', { name: 'Confirmar remoção' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível remover ENEM 2022. Tente novamente. armazenamento ocupado');
    expect(screen.getByRole('button', { name: 'Remover ENEM 2022 do dispositivo' })).toHaveFocus();
    expect(onContentChange).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Remover ENEM 2022 do dispositivo' }));
    await user.click(screen.getByRole('button', { name: 'Confirmar remoção' }));
    expect(await screen.findByText('ENEM 2022 foi removida. Sua prova ativa continua sendo ENEM 2023.')).toBeInTheDocument();
    expect(screen.getByText('Prova ativa:', { exact: false })).toHaveTextContent('Prova ativa: ENEM 2023');
    expect(packagePort.remove).toHaveBeenCalledTimes(2);
    expect(onContentChange).toHaveBeenCalledOnce();
  });
});
