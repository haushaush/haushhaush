import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Check, X, Image as ImageIcon } from 'lucide-react';

type ReviewAsset = {
  id: string;
  file_name: string;
  file_type: string;
  drive_preview_url: string | null;
  version_nr: number;
  status: string;
};

export default function CreativeReview() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [project, setProject] = useState<any>(null);
  const [client, setClient] = useState<any>(null);
  const [assets, setAssets] = useState<ReviewAsset[]>([]);
  const [decisions, setDecisions] = useState<Record<string, 'approve' | 'change' | null>>({});
  const [comments, setComments] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchData = async () => {
      if (!token) return;
      const projRes = await supabase.from('creative_projects').select('*').eq('review_token', token).single();
      if (!projRes.data) {
        setError('Review-Link ungültig oder abgelaufen.');
        setLoading(false);
        return;
      }
      setProject(projRes.data);
      const [clientRes, assetsRes] = await Promise.all([
        supabase.from('clients').select('name').eq('id', projRes.data.client_id).single(),
        supabase.from('creative_assets').select('*').eq('project_id', projRes.data.id).eq('is_active', true).order('uploaded_at'),
      ]);
      setClient(clientRes.data);
      setAssets((assetsRes.data || []) as unknown as ReviewAsset[]);
      setLoading(false);
    };
    fetchData();
  }, [token]);

  const handleSubmit = async () => {
    // Validate all assets have decisions
    const incomplete = assets.filter(a => !decisions[a.id]);
    if (incomplete.length > 0) {
      setError('Bitte bewerte alle Creatives.');
      return;
    }
    const needsComment = assets.filter(a => decisions[a.id] === 'change' && !comments[a.id]?.trim());
    if (needsComment.length > 0) {
      setError('Bitte gib für alle Änderungswünsche einen Kommentar ein.');
      return;
    }

    setSubmitting(true);
    setError('');

    for (const asset of assets) {
      if (decisions[asset.id] === 'approve') {
        await supabase.from('creative_approvals').insert({
          project_id: project.id,
          asset_id: asset.id,
          approved_by: client?.name || 'Kunde',
          approval_type: 'Kunde' as any,
        });
        await supabase.from('creative_assets').update({ status: 'Freigegeben' as any }).eq('id', asset.id);
      } else if (decisions[asset.id] === 'change') {
        await supabase.from('creative_feedback').insert({
          asset_id: asset.id,
          author_name: client?.name || 'Kunde',
          author_type: 'Kunde' as any,
          comment: comments[asset.id],
        });
        await supabase.from('creative_assets').update({ status: 'Feedback erhalten' as any }).eq('id', asset.id);
      }
    }

    // Update project status based on results
    const allApproved = assets.every(a => decisions[a.id] === 'approve');
    if (allApproved) {
      await supabase.from('creative_projects').update({ status: 'Freigegeben' as any }).eq('id', project.id);
    } else {
      await supabase.from('creative_projects').update({ status: 'Änderungen nötig' as any }).eq('id', project.id);
    }

    setSubmitting(false);
    setSubmitted(true);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center" role="status" aria-busy="true">
        <div className="space-y-4 w-full max-w-3xl p-6">
          <Skeleton className="h-8 w-64 bg-gray-200" />
          <Skeleton className="h-[300px] bg-gray-200" />
        </div>
      </div>
    );
  }

  if (error && !project) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Link ungültig</h1>
          <p className="text-gray-600">{error}</p>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
            <Check className="h-8 w-8 text-green-600" aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Vielen Dank!</h1>
          <p className="text-gray-600">Dein Feedback wurde übermittelt. Wir melden uns bei dir.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-4xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-10 w-10 rounded-full bg-[#0A1628] flex items-center justify-center">
              <span className="text-[#D4AF37] font-bold text-lg">H</span>
            </div>
            <div>
              <p className="text-sm text-gray-500">Haush Haush Digital × Viral Connect</p>
              <p className="text-sm font-medium text-gray-700">{client?.name}</p>
            </div>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-1">Creative Review</h1>
          <p className="text-gray-600">
            Bitte überprüfe die folgenden Ad Creatives für <strong>{project?.name}</strong>
          </p>
        </div>

        {error && <p className="text-red-600 text-sm mb-4" role="alert">{error}</p>}

        {/* Asset grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-8">
          {assets.map(asset => (
            <Card key={asset.id} className={`border-2 transition-colors ${
              decisions[asset.id] === 'approve' ? 'border-green-500' :
              decisions[asset.id] === 'change' ? 'border-red-400' : 'border-gray-200'
            }`}>
              <CardContent className="p-0">
                <div className="aspect-video bg-gray-100 flex items-center justify-center rounded-t-lg overflow-hidden">
                  {asset.drive_preview_url ? (
                    <img src={asset.drive_preview_url} alt={asset.file_name} className="w-full h-full object-cover" />
                  ) : (
                    <ImageIcon className="h-10 w-10 text-gray-400" aria-hidden="true" />
                  )}
                </div>
                <div className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-gray-900 text-sm">{asset.file_name}</p>
                    <Badge variant="outline" className="text-xs">v{asset.version_nr}</Badge>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className={`flex-1 min-h-[44px] ${decisions[asset.id] === 'approve' ? 'bg-green-600 hover:bg-green-700 text-white' : 'bg-gray-100 text-gray-700 hover:bg-green-50'}`}
                      onClick={() => setDecisions(d => ({ ...d, [asset.id]: 'approve' }))}
                      aria-label={`${asset.file_name} freigeben`}
                    >
                      <Check className="h-4 w-4 mr-1" aria-hidden="true" /> Freigeben
                    </Button>
                    <Button
                      size="sm"
                      className={`flex-1 min-h-[44px] ${decisions[asset.id] === 'change' ? 'bg-red-500 hover:bg-red-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-red-50'}`}
                      onClick={() => setDecisions(d => ({ ...d, [asset.id]: 'change' }))}
                      aria-label={`${asset.file_name} Änderung anfragen`}
                    >
                      <X className="h-4 w-4 mr-1" aria-hidden="true" /> Änderung
                    </Button>
                  </div>
                  {decisions[asset.id] === 'change' && (
                    <Textarea
                      placeholder="Was soll geändert werden?"
                      value={comments[asset.id] || ''}
                      onChange={e => setComments(c => ({ ...c, [asset.id]: e.target.value }))}
                      className="text-sm border-gray-300"
                      aria-label={`Kommentar für ${asset.file_name}`}
                    />
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Button
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full min-h-[44px] bg-[#0A1628] hover:bg-[#0A1628]/90 text-white"
        >
          {submitting ? 'Wird gesendet...' : 'Feedback absenden'}
        </Button>
      </div>
    </div>
  );
}
